const Todo = require('./models/Todo');
const User = require('./models/User');
const { sendMail } = require('./mail');

// Check every 60 seconds for due todos
const CHECK_INTERVAL_MS = 60 * 1000;
// Reminder settings
const REMINDER_INTERVAL_MS = (process.env.REMINDER_INTERVAL_MINUTES ? Number(process.env.REMINDER_INTERVAL_MINUTES) : 10) * 60 * 1000; // default 10 minutes
const MAX_REMINDERS = process.env.MAX_REMINDERS ? Number(process.env.MAX_REMINDERS) : 3;

function parseDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;
  const timePart = dueTime && dueTime.trim() ? dueTime : '00:00';
  // assume dueDate in YYYY-MM-DD and dueTime in HH:MM
  const iso = `${dueDate}T${timePart}:00`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d;
}

let ioInstance = null;

async function checkAndSendNotifications() {
  try {
    const now = new Date();
    // find todos that are not completed and have a dueDate and still eligible for reminders
    const todos = await Todo.find({
      completed: false,
      dueDate: { $exists: true, $ne: '' },
      $or: [
        { notificationSent: { $ne: true } },
        { reminderCount: { $lt: MAX_REMINDERS } }
      ]
    }).limit(200);

    for (const todo of todos) {
      const dueAt = parseDueDateTime(todo.dueDate, todo.dueTime);
      if (!dueAt) continue;

      const nowMs = now.getTime();
      const dueMs = dueAt.getTime();
      const timeUntilDueMs = dueMs - nowMs;
      const lastReminderMs = todo.lastReminderAt ? new Date(todo.lastReminderAt).getTime() : 0;

      let shouldSend = false;
      let isInitial = false;
      let isBeforeDue = false;

      // Send first reminder 10 minutes before due time if the task is not yet notified.
      if (!todo.notificationSent && timeUntilDueMs <= REMINDER_INTERVAL_MS) {
        shouldSend = true;
        isInitial = true;
        isBeforeDue = timeUntilDueMs > 0;
      }

      // If the task is now due or overdue, send the initial reminder late or follow-up reminders.
      if (timeUntilDueMs <= 0 && (todo.reminderCount || 0) < MAX_REMINDERS) {
        if (!todo.notificationSent) {
          shouldSend = true;
          isInitial = true;
        } else if (!todo.lastReminderAt || (nowMs - lastReminderMs) >= REMINDER_INTERVAL_MS) {
          shouldSend = true;
        }
      }

      if (!shouldSend) continue;

      const user = await User.findById(todo.userId);
      if (!user || !user.email) continue;

      const attempt = (todo.reminderCount || 0) + 1;
      const subject = isInitial
        ? (isBeforeDue ? `Upcoming task: ${todo.text}` : `Todo due: ${todo.text}`)
        : `Reminder (${attempt}) - Todo due: ${todo.text}`;
      const text = isInitial
        ? (isBeforeDue
          ? `Your todo "${todo.text}" is due in 10 minutes at ${todo.dueDate} ${todo.dueTime || ''}.`
          : `Your todo "${todo.text}" is due now (${todo.dueDate} ${todo.dueTime || ''}).`)
        : `Reminder #${attempt}: Your todo "${todo.text}" is still due (created for ${todo.dueDate} ${todo.dueTime || ''}).`;

      try {
        const { info, preview } = await sendMail({ to: user.email, subject, text, html: `<p>${text}</p>` });
        console.log('Sent deadline notification to', user.email, 'todoId', todo._id, 'messageId', info && info.messageId);
        if (preview) console.log('Preview URL:', preview);

        // update counters and flags
        if (isInitial) {
          todo.notificationSent = true;
          todo.notificationSentAt = new Date();
        }

        todo.reminderCount = attempt;
        todo.lastReminderAt = new Date();
        // mark in-app notification as pending so frontend shows it
        todo.notificationShown = false;

        await todo.save();

        // emit real-time notification to connected client (if io provided)
        try {
          if (ioInstance && user && user._id) {
            ioInstance.to(user._id.toString()).emit('notification', {
              todoId: todo._id,
              text: todo.text,
              dueDate: todo.dueDate,
              dueTime: todo.dueTime,
              reminderCount: todo.reminderCount
            });
          }
        } catch (e) {
          console.error('Error emitting socket notification', e && e.message);
        }
      } catch (err) {
        console.error('Error sending notification for todo', todo._id, err && err.message);
      }
    }
  } catch (err) {
    console.error('Scheduler error', err && err.message);
  }
}

let timer;

function startScheduler(io) {
  if (timer) return;
  ioInstance = io || null;
  timer = setInterval(checkAndSendNotifications, CHECK_INTERVAL_MS);
  // run immediately
  checkAndSendNotifications();
  console.log('Notification scheduler started');
}

module.exports = { startScheduler };
