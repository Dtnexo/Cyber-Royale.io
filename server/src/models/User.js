const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const bcrypt = require("bcrypt");

const User = sequelize.define("User", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  salt: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  coins: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  requiresReset: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  kills: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  brWins: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
});

User.beforeCreate(async (user) => {
  if (user.password) {
    const salt = await bcrypt.genSalt(10);
    user.salt = salt;
    user.password = await bcrypt.hash(user.password, salt);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed("password")) {
    console.log(
      "----------------------------------------------------------------"
    );
    console.log(
      `[SECURITY DEBUG] Password change detected for user ${user.username}`
    );
    console.log(
      `[SECURITY DEBUG] Old hash length: ${
        user.previous("password") ? user.previous("password").length : "N/A"
      }`
    );
    console.log(
      `[SECURITY DEBUG] New value length: ${
        user.password ? user.password.length : "N/A"
      }`
    );
    console.log(
      `[SECURITY DEBUG] New value preview: ${
        user.password ? user.password.substring(0, 10) + "..." : "N/A"
      }`
    );
    console.log(`[SECURITY DEBUG] Stack Trace:`);
    console.log(new Error().stack);
    console.log(
      "----------------------------------------------------------------"
    );

    // Only hash if it looks like a plain password (e.g. length < 50)
    // Avoid double-hashing if it's already a hash (length 60)
    if (user.password && user.password.length < 50) {
      console.log("[SECURITY DEBUG] Hashing plain password...");
      const salt = await bcrypt.genSalt(10);
      user.salt = salt;
      user.password = await bcrypt.hash(user.password, salt);
      user.requiresReset = false; // Clear reset flag explicitly
    } else {
      console.log(
        "[SECURITY DEBUG] Password appears to be already hashed. Skipping re-hash."
      );
    }
  }
});

User.prototype.validPassword = async function (password) {
  if (this.salt) {
    const hash = await bcrypt.hash(password, this.salt);
    return hash === this.password;
  }
  return await bcrypt.compare(password, this.password);
};

module.exports = User;
