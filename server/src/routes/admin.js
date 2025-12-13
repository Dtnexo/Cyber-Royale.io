const express = require("express");
const router = express.Router();
const { User, Hero, UserUnlock } = require("../models");
const authMiddleware = require("../utils/authMiddleware");
const adminMiddleware = require("../utils/adminMiddleware");

// Apply middleware to all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /admin/stats - System Overview
router.get("/stats", async (req, res) => {
  try {
    const userCount = await User.count();
    const heroCount = await Hero.count();
    const totalCoins = await User.sum("coins");

    res.json({
      uptime: process.uptime(),
      userCount,
      heroCount,
      totalCoins,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /admin/users - List Users
router.get("/users", async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "username", "email", "coins", "isAdmin", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /admin/user/:id/coins - Give/Take Coins
router.post("/user/:id/coins", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) return res.status(404).json({ error: "User not found" });

    user.coins += parseInt(amount);
    await user.save();

    res.json({ message: "Coins updated", newBalance: user.coins });
  } catch (error) {
    res.status(500).json({ error: "Update failed" });
  }
});

module.exports = router;
