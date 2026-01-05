require("dotenv").config();
const { sequelize, User } = require("../models");

async function forceResetAll() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    // Update all users to require a password reset
    const result = await User.update(
      { requiresReset: true },
      { where: {} } // Apply to ALL users
    );

    console.log(`✅ Forced reset flag set for ${result} users.`);
    console.log(
      "Users will be prompted to change their password on next login."
    );
  } catch (err) {
    console.error("❌ Error setting force reset flag:", err);
  } finally {
    await sequelize.close();
  }
}

forceResetAll();
