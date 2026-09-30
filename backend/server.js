const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const connectDB = require("./db");
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.APP_URL,
  process.env.RENDER_EXTERNAL_URL,
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
].filter(Boolean);

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
}));
app.use(express.json());

app.use((req, res, next) => {
  const privateStaticPaths = new Set([
    '/server.js',
    '/authRoutes.js',
    '/scheduler.js',
    '/package.json',
    '/package-lock.json'
  ]);
  if (req.path === '/backend' || req.path.startsWith('/backend/') || privateStaticPaths.has(req.path)) {
    return res.sendStatus(404);
  }
  return next();
});

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

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'todo-secret');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins } });

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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});