const { Sequelize } = require("sequelize");
require("dotenv").config();

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
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      dialect: "mysql",
      logging: false,
    }
  );
}

module.exports = sequelize;
