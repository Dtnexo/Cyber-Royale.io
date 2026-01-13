const router = require("express").Router();
const { User, Hero } = require("../models");
const auth = require("../utils/authMiddleware");

router.put("/update", auth, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Username uniqueness check
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        return res.status(400).json({ message: "Username already taken" });
      }
      user.username = username;
    }

    // 2. Password update (Hook in User model handles hashing)
    if (password && password.trim().length > 0) {
      user.password = password;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        coins: user.coins,
        requiresReset: user.requiresReset, // Critical for frontend state update
      },
    });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Hero,
          as: "unlockedHeroes",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Transform to simple list of IDs
    const unlockedIds = user.unlockedHeroes
      ? user.unlockedHeroes.map((h) => h.id)
      : [];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      coins: user.coins,
      requiresReset: user.requiresReset,
      unlockedHeroes: unlockedIds,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
