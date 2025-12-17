const router = require("express").Router();
const { User, UserUnlock, Hero } = require("../models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate request body
    if (!username || !email || !password) {
      console.error("Registration failed: Missing required fields", {
        hasUsername: !!username,
        hasEmail: !!email,
        hasPassword: !!password,
      });
      return res.status(400).json({
        error:
          "Missing required fields: username, email, and password are required",
      });
    }

    console.log(
      `Registration attempt for username: ${username}, email: ${email}`
    );

    // 1. Create user
    const user = await User.create({ username, email, password });
    console.log(`User created successfully: ${user.id}`);

    // 2. Unlock default heroes (Vanguard, Spectre, Techno, Sniper)
    // Wrap in try-catch to prevent registration failure if heroes don't exist
    try {
      const initialHeroIds = [1, 2, 3, 10];
      const unlocks = initialHeroIds.map((id) => ({
        userId: user.id,
        heroId: id,
      }));
      await UserUnlock.bulkCreate(unlocks);
      console.log(`Default heroes unlocked for user: ${user.id}`);
    } catch (heroErr) {
      console.warn(
        `Failed to unlock default heroes for user ${user.id}. Heroes may not exist in database.`,
        heroErr.message
      );
      // Continue anyway - user is created, they just won't have default heroes
    }

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
      console.error("Registration failed: Duplicate username or email", {
        fields: err.fields,
      });
      return res
        .status(400)
        .json({ error: "Username or Email already exists." });
    }
    if (err.name === "SequelizeValidationError") {
      console.error("Registration failed: Validation error", {
        errors: err.errors.map((e) => e.message),
      });
      return res
        .status(400)
        .json({ error: err.errors.map((e) => e.message).join(", ") });
    }
    console.error("Registration failed with unexpected error:", err);
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Validate request body
    if (!identifier || !password) {
      console.error("Login failed: Missing required fields", {
        hasIdentifier: !!identifier,
        hasPassword: !!password,
      });
      return res.status(400).json({
        error: "Missing required fields: identifier and password are required",
      });
    }

    console.log(`Login attempt for identifier: ${identifier}`);

    // Find by Email OR Username
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      console.warn(
        `Login failed: User not found for identifier: ${identifier}`
      );
      return res.status(400).json({ message: "User not found" });
    }

    // Validate password
    if (!user.validPassword) {
      console.error(
        `Login failed: validPassword method not available for user: ${user.id}`
      );
      return res
        .status(500)
        .json({ error: "Authentication method unavailable" });
    }

    const validPass = await user.validPassword(password);
    if (!validPass) {
      console.warn(`Login failed: Invalid password for user: ${user.id}`);
      return res.status(400).json({ message: "Invalid password" });
    }

    console.log(`Login successful for user: ${user.id}`);

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
    console.error("Login failed with unexpected error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
