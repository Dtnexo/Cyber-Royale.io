require("dotenv").config();
const { sequelize, User } = require("../models");

async function resetAdmin() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

    const user = await User.findOne({ where: { username: adminUsername } });

    if (!user) {
      console.error(`User '${adminUsername}' not found!`);
      process.exit(1);
    }

    console.log(`Found user: ${user.username} (ID: ${user.id})`);
    console.log(`Resetting password to: ${adminPassword}`);

    // Update password
    user.password = adminPassword;

    // The User model hooks will handle the hashing automatically
    // thanks to our recent fixes.
    await user.save();

    console.log("✅ Password successfully reset.");
    console.log("You can now login with: " + adminPassword);
  } catch (err) {
    console.error("❌ Error resetting password:", err);
  } finally {
    await sequelize.close();
  }
}

resetAdmin();
