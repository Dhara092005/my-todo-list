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
  priority: {
    type: String,
    default: "medium"
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
});

module.exports = mongoose.model("Todo", todoSchema);