const express = require("express");
const router = express.Router();
const { User } = require("../models");

router.get("/", async (req, res) => {
  try {
    const users = await User.findAll({
      order: [["kills", "DESC"]],
      limit: 10,
      attributes: ["username", "kills", "coins"], // Only send safe data
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

module.exports = router;
