const { sequelize } = require("../models");

async function updateSchema() {
  try {
    // Check if 'salt' column exists
    const [resultsSalt] = await sequelize.query(
      "SHOW COLUMNS FROM `Users` LIKE 'salt';"
    );
    if (resultsSalt.length === 0) {
      console.log("Adding missing column 'salt' to Users table...");
      await sequelize.query(
        "ALTER TABLE `Users` ADD COLUMN `salt` VARCHAR(255) NULL;"
      );
    }

    // Check if 'requiresReset' column exists
    const [resultsReset] = await sequelize.query(
      "SHOW COLUMNS FROM `Users` LIKE 'requiresReset';"
    );
    if (resultsReset.length === 0) {
      console.log("Adding missing column 'requiresReset' to Users table...");
      await sequelize.query(
        "ALTER TABLE `Users` ADD COLUMN `requiresReset` TINYINT(1) DEFAULT 0;"
      );
    }

    console.log("Schema check complete.");
  } catch (error) {
    console.warn(
      "Schema update warning (safe to ignore if columns exist):",
      error.message
    );
  }
}

module.exports = updateSchema;
