const { Sequelize } = require("sequelize");
require("dotenv").config();

console.log(
  "DEBUG: Available Environment Variables:",
  Object.keys(process.env).sort().join(", ")
);

let sequelize;

if (process.env.MYSQL_URL) {
  console.log("Using MYSQL_URL for database connection");
  sequelize = new Sequelize(process.env.MYSQL_URL, {
    dialect: "mysql",
    logging: false,
  });
} else if (process.env.DATABASE_URL) {
  console.log("Using DATABASE_URL for database connection");
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "mysql",
    logging: false,
  });
} else {
  console.log("Using separate DB env vars (DB_HOST, etc)");
  console.log(
    "DB_HOST:",
    process.env.DB_HOST || "(not set, defaulting to localhost)"
  );
  sequelize = new Sequelize(
    process.env.DB_NAME || "neon_arena_db",
    process.env.DB_USER || "root",
    process.env.DB_PASS || "rootpassword",
    {
      host: process.env.DB_HOST || "localhost",
      dialect: "mysql",
      logging: false,
    }
  );
}

module.exports = sequelize;
