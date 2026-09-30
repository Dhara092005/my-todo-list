const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const connectDB = require("./db");

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(cors());
app.use(express.json());

// Serve frontend static files (so routes like /reset-password.html work)
app.use(express.static(path.join(__dirname, "..")));

// ---------------- DATABASE CONNECTION ----------------
connectDB();

// ---------------- ROUTES ----------------
const authRoutes = require("./routes/authRoutes");
const todoRoutes = require("./routes/todoRoutes");

// ⚠️ IMPORTANT FIX: use proper route prefixes
app.use("/auth", authRoutes);
app.use("/todos", todoRoutes);

// ---------------- START SCHEDULER ----------------
try {
  const { startScheduler } = require('./scheduler');
  startScheduler();
} catch (e) {
  console.error('Failed to start scheduler:', e && e.message);
}

// ---------------- TEST ROUTE ----------------
app.get("/", (req, res) => {
  res.send("Todo backend running 🚀");
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});