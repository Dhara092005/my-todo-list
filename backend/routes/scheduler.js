const Todo = require('./models/Todo');
const User = require('./models/User');
const { sendMail } = require('./mail');

// Check every 60 seconds for due todos
const CHECK_INTERVAL_MS = 60 * 1000;

function parseDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;
  const timePart = dueTime && dueTime.trim() ? dueTime : '00:00';
  // assume dueDate in YYYY-MM-DD and dueTime in HH:MM
  const iso = `${dueDate}T${timePart}:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d;
}

async function checkAndSendNotifications() {
  try {
    const now = new Date();
    // find todos that are not completed and not yet notified and have a dueDate
    const todos = await Todo.find({ completed: false, notificationSent: { $ne: true }, dueDate: { $exists: true, $ne: '' } }).limit(100);

    for (const todo of todos) {
      const dueAt = parseDueDateTime(todo.dueDate, todo.dueTime);
      if (!dueAt) continue;
      if (dueAt <= now) {
        // fetch user email
        const user = await User.findById(todo.userId);
        if (!user || !user.email) continue;

        const subject = `Todo due: ${todo.text}`;
        const text = `Your todo "${todo.text}" is due now (${todo.dueDate} ${todo.dueTime || ''}).`;

        try {
          const { info, preview } = await sendMail({ to: user.email, subject, text, html: `<p>${text}</p>` });
          console.log('Sent deadline notification to', user.email, 'todoId', todo._id, 'messageId', info && info.messageId);
          if (preview) console.log('Preview URL:', preview);

          todo.notificationSent = true;
          todo.notificationSentAt = new Date();
          await todo.save();
        } catch (err) {
          console.error('Error sending notification for todo', todo._id, err && err.message);
        }
      }
    }
  } catch (err) {
    console.error('Scheduler error', err && err.message);
  }
}

let timer;

function startScheduler() {
  if (timer) return;
  timer = setInterval(checkAndSendNotifications, CHECK_INTERVAL_MS);
  // run immediately
  checkAndSendNotifications();
  console.log('Notification scheduler started');
}

module.exports = { startScheduler };
