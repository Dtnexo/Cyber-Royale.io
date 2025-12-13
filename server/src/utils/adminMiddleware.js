const { User } = require("../models");

const isAdmin = async (req, res, next) => {
  try {
    // Expect authMiddleware to have already run and attached req.user
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Double check admin status from DB to be safe
    const user = await User.findByPk(req.user.id);

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }

    // Proceed
    next();
  } catch (error) {
    console.error("Admin check failed", error);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = isAdmin;
