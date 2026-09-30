const express = require("express");
const router = express.Router();
const Todo = require("../models/Todo");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'todo-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Please log in again.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.id) {
      return res.status(401).json({ success: false, message: 'Invalid session.' });
    }
    req.userId = payload.id;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

router.use(requireAuth);

// ---------------- ADD TODO ----------------
router.post("/add", async (req, res) => {
  try {
    const { text, dueDate, dueTime, category, reminderLeadMinutes, priority, repeat } = req.body;

    if (!text) {
      return res.json({
        success: false,
        message: "Task text is required"
      });
    }

    const todo = new Todo({
      userId: req.userId,
      text,
      dueDate,
      dueTime,
      category: category ? String(category).trim() : '',
      reminderLeadMinutes: Number(reminderLeadMinutes) || 10,
      priority: priority || "low",
      repeat: repeat || 'none',
      completed: false,
      createdAt: new Date()
    });

    await todo.save();

    res.json({
      success: true,
      message: "Todo created successfully",
      todo
    });

  } catch (err) {
    res.json({
      success: false,
      message: err.message
    });
  }
});


// ---------------- GET TODOS ----------------
router.get("/", async (req, res) => {
  try {
    const { search, category } = req.query;

    const query = { userId: req.userId };
    if (category) {
      query.category = { $regex: new RegExp(category, 'i') };
    }

    if (search) {
      query.$or = [
        { text: { $regex: new RegExp(search, 'i') } },
        { category: { $regex: new RegExp(search, 'i') } }
      ];
    }

    const todos = await Todo.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      todos
    });

  } catch (err) {
    res.json({
      success: false,
      message: err.message
    });
  }
});


// ---------------- GET NOTIFICATIONS ----------------
router.get('/notifications/:userId', async (req, res) => {
  try {
    const userId = req.userId;
    const todos = await Todo.find({ userId, notificationSent: true, notificationShown: { $ne: true } }).sort({ notificationSentAt: -1 });

    res.json({ success: true, todos });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});


// ---------------- ACKNOWLEDGE NOTIFICATION ----------------
router.put('/notifications/ack/:id', async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.userId });
    if (!todo) return res.json({ success: false, message: 'Todo not found' });

    todo.notificationShown = true;
    await todo.save();

    res.json({ success: true, message: 'Notification acknowledged' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ---------------- SNOOZE NOTIFICATION ----------------
router.put('/notifications/snooze/:id', async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.userId });
    if (!todo) return res.json({ success: false, message: 'Todo not found' });

    const minutes = Number(req.query.minutes) || 5;
    todo.snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
    todo.notificationShown = false;
    await todo.save();

    res.json({ success: true, message: `Snoozed for ${minutes} minutes`, snoozeUntil: todo.snoozeUntil });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ---------------- UPDATE TODO ----------------
router.put('/update/:id', async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.userId });
    if (!todo) return res.json({ success: false, message: 'Todo not found' });

    const { text, dueDate, dueTime, category, favorite, reminderLeadMinutes, priority, repeat } = req.body;

    if (typeof text === 'string') todo.text = text;
    if (typeof dueDate === 'string') todo.dueDate = dueDate;
    if (typeof dueTime === 'string') todo.dueTime = dueTime;
    if (typeof category === 'string') todo.category = category.trim();
    if (typeof favorite === 'boolean') todo.favorite = favorite;
    if (typeof reminderLeadMinutes !== 'undefined') todo.reminderLeadMinutes = Number(reminderLeadMinutes) || 10;
    if (typeof priority === 'string') todo.priority = priority;
    if (typeof repeat === 'string') todo.repeat = repeat;

    todo.snoozeUntil = null;
    todo.notificationSent = false;
    todo.notificationShown = false;
    todo.reminderCount = 0;
    todo.lastReminderAt = null;

    await todo.save();

    res.json({ success: true, message: 'Todo updated', todo });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ---------------- TOGGLE TODO ----------------
router.put("/toggle/:id", async (req, res) => {
  try {
    const todo = await Todo.findOne({ _id: req.params.id, userId: req.userId });

    if (!todo) {
      return res.json({
        success: false,
        message: "Todo not found"
      });
    }

    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? new Date() : null;

    if (todo.completed && todo.repeat && todo.repeat !== 'none') {
      const nextDue = todo.dueDate ? new Date(`${todo.dueDate}T${todo.dueTime || '00:00'}:00`) : new Date();
      switch (todo.repeat) {
        case 'daily':
          nextDue.setDate(nextDue.getDate() + 1);
          break;
        case 'weekly':
          nextDue.setDate(nextDue.getDate() + 7);
          break;
        case 'weekdays':
          do {
            nextDue.setDate(nextDue.getDate() + 1);
          } while (nextDue.getDay() === 0 || nextDue.getDay() === 6);
          break;
        case 'monthly':
          nextDue.setMonth(nextDue.getMonth() + 1);
          break;
      }
      const yyyy = nextDue.getFullYear();
      const mm = String(nextDue.getMonth() + 1).padStart(2, '0');
      const dd = String(nextDue.getDate()).padStart(2, '0');
      todo.dueDate = `${yyyy}-${mm}-${dd}`;
      todo.completed = false;
      todo.completedAt = null;
      todo.notificationSent = false;
      todo.notificationShown = false;
      todo.reminderCount = 0;
      todo.lastReminderAt = null;
    }

    await todo.save();

    res.json({
      success: true,
      message: "Todo updated",
      todo
    });

  } catch (err) {
    res.json({
      success: false,
      message: err.message
    });
  }
});


// ---------------- DELETE TODO ----------------
router.delete("/:id", async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({ _id: req.params.id, userId: req.userId });

    if (!todo) {
      return res.json({
        success: false,
        message: "Todo not found"
      });
    }

    res.json({
      success: true,
      message: "Todo deleted"
    });

  } catch (err) {
    res.json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;