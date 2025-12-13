require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { sequelize } = require("./models");

// Routes
const authRoutes = require("./routes/auth");
const shopRoutes = require("./routes/shop");
const userRoutes = require("./routes/user");
const leaderboardRoutes = require("./routes/leaderboard");

// Game Server logic
const GameServer = require("./game/GameServer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/auth", authRoutes); // Legacy or specific path? Client uses /api sometimes?
// Checking context: dashboard uses auth.fetchProfile().
// Let's stick to simple paths or prefixed. The client `api.js` usually defines the base URL.
// Previous file had: app.use("/auth", ...);
// But wait, the edit I TRIED to make used /api/ prefixes.
// Let's stick to what was likely there before: /auth, /shop, /user
// AND add /leaderboard.
app.use("/auth", authRoutes);
app.use("/shop", shopRoutes);
app.use("/user", userRoutes);
app.use("/leaderboard", leaderboardRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("Neon Heroes API Running");
});

// Database Sync & Start
const PORT = process.env.PORT || 3005;

sequelize
  .sync({ alter: true }) // Safer to use alter in dev
  .then(() => {
    console.log("Database synced");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      // Start Game Server
      new GameServer(io);
    });
  })
  .catch((err) => {
    console.error("Failed to sync db:", err);
  });
