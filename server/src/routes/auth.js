const router = require("express").Router();
const { User, UserUnlock, Hero } = require("../models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Create user
    const user = await User.create({ username, email, password });

    // 2. Unlock default heroes (Vanguard, Spectre, Techno, Sniper)
    const initialHeroIds = [1, 2, 3, 10];
    const unlocks = initialHeroIds.map((id) => ({
      userId: user.id,
      heroId: id,
    }));
    await UserUnlock.bulkCreate(unlocks);

    // 3. Generate Token for Auto-Login
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || "default_secret_key",
      {
        expiresIn: "24h",
      }
    );

    res.status(201).json({
      message: "User created",
      token,
      user: {
        id: user.id,
        username: user.username,
        coins: user.coins,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    // Specific Error Handling
    if (err.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ error: "Username or Email already exists." });
    }
    if (err.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json({ error: err.errors.map((e) => e.message).join(", ") });
    }
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Find by Email OR Username
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) return res.status(400).json({ message: "User not found" });

    const validPass = await user.validPassword(password);
    if (!validPass)
      return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || "default_secret_key",
      {
        expiresIn: "24h",
      }
    );
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        coins: user.coins,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
