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

// ---------------- START REAL-TIME SERVER ----------------
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'todo-secret';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.id;
    return next();
  } catch (err) {
    return next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  if (socket.userId) {
    socket.join(socket.userId.toString());
  }
});

// ---------------- START SCHEDULER ----------------
try {
  const { startScheduler } = require('./scheduler');
  startScheduler(io);
} catch (e) {
  console.error('Failed to start scheduler:', e && e.message);
}

// ---------------- TEST ROUTE ----------------
app.get("/", (req, res) => {
  res.send("Todo backend running 🚀");
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});