const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  text: {
    type: String,
    required: true
  },
  dueDate: String,
  dueTime: String,
  category: {
    type: String,
    default: ''
  },
  favorite: {
    type: Boolean,
    default: false
  },
  favorite: {
    type: Boolean,
    default: false
  },
  reminderLeadMinutes: {
    type: Number,
    default: 10
  },
  priority: {
    type: String,
    default: "medium"
  },
  repeat: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'weekdays', 'monthly'],
    default: 'none'
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
  ,
  notificationSent: {
    type: Boolean,
    default: false
  },
  notificationSentAt: {
    type: Date,
    default: null
  }
  ,
  notificationShown: {
    type: Boolean,
    default: false
  }
  ,
  reminderCount: {
    type: Number,
    default: 0
  },
  lastReminderAt: {
    type: Date,
    default: null
  },
  snoozeUntil: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model("Todo", todoSchema);