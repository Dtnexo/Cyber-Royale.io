const express = require("express");
const router = express.Router();
const { User } = require("../models");

router.get("/", async (req, res) => {
  try {
    const type = req.query.type === "wins" ? "brWins" : "kills";

    const users = await User.findAll({
      order: [[type, "DESC"]],
      limit: 10,
      attributes: ["username", "kills", "brWins", "coins"], // Added brWins
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

module.exports = router;
