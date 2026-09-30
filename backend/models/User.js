const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  // ✅ ADD THESE FOR RESET PASSWORD
  resetToken: {
    type: String
  },
  resetTokenExpiry: {
    type: Date
  }
});

module.exports = mongoose.model("User", userSchema);