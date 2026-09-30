const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/todo";
    await mongoose.connect(mongoUrl);

    console.log("MongoDB connected successfully 🚀");
  } catch (error) {
    console.log("MongoDB connection error:", error);
  }
};

module.exports = connectDB;