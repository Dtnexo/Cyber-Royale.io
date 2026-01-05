require("dotenv").config();
const { sequelize, User } = require("../models");

async function migrateSalts() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    // Fetch users without a salt
    const users = await User.findAll({
      where: {
        salt: null,
      },
    });

    console.log(`Found ${users.length} users needing salt migration.`);

    for (const user of users) {
      if (user.password && user.password.startsWith("$2b$")) {
        // Bcrypt format: $2b$10$...................... (29 chars prefix is the salt setting)
        // Or typically checking the first 29 chars gives us the salt string necessary for bcrypt.hash
        // Actually, bcrypt uses the full string as a salt parameter just fine.

        // Extract the salt (first 29 chars typically: $2b$10$ + 22 chars of pure salt)
        const salt = user.password.substring(0, 29);

        console.log(`Migrating user: ${user.username} (ID: ${user.id})`);
        user.salt = salt;

        // Disable hooks to prevent re-hashing loops or modifications
        await user.save({ hooks: false });
      } else {
        console.warn(
          `Skipping user ${user.username}: Password format not recognized (not bcrypt $2b$).`
        );
      }
    }

    console.log("✅ Salt migration completed.");
  } catch (err) {
    console.error("❌ Error migrating salts:", err);
  } finally {
    await sequelize.close();
  }
}

migrateSalts();
