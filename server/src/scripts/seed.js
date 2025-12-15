const { sequelize, Hero, User } = require("../models");
const bcrypt = require("bcrypt");

async function seed() {
  try {
    // Safe Sync: Update existing tables without dropping data
    await sequelize.sync(); 

    // Ensure Heroes table is updated with new prices
    const heroes = [
      {
        id: 1,
        name: "Vanguard",
        price: 0,
        class: "Tank",
        skins: [
          { name: "Default", value: "#00ccff" },
          { name: "Red Guard", value: "#ff3333" },
          { name: "Golden", value: "#ffd700" },
        ],
        stats: { hp: 220, speed: 90, cooldown: 5000 },
      },
      {
        id: 2,
        name: "Spectre",
        price: 400,
        class: "Speed",
        skins: [
          { name: "Default", value: "#aa00ff" },
          { name: "Shadow", value: "#1a1a1a" },
          { name: "Ghost White", value: "#ffffff" },
        ],
        stats: { hp: 85, speed: 155, cooldown: 5000 }, // Buffed HP/Speed, Lower CD for Dash
      },
      {
        id: 3,
        name: "Techno",
        price: 400,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffee00" },
          { name: "Toxic", value: "#00ff00" },
          { name: "Rust", value: "#cd7f32" },
        ],
        stats: { hp: 140, speed: 110, cooldown: 10000 },
      },
      {
        id: 4,
        name: "Blaze",
        price: 500,
        class: "Damage",
        skins: [
          { name: "Default", value: "#ff4500" },
          { name: "Blue Flame", value: "#00b7ff" },
        ],
        stats: { hp: 110, speed: 115, cooldown: 6000 },
      },
      {
        id: 5,
        name: "Titan",
        price: 600,
        class: "Tank",
        skins: [
          { name: "Default", value: "#556b2f" },
          { name: "Iron", value: "#708090" },
        ],
        stats: { hp: 280, speed: 75, cooldown: 12000 },
      },
      {
        id: 6,
        name: "Volt",
        price: 600,
        class: "Speed",
        skins: [
          { name: "Default", value: "#00ffff" },
          { name: "Overload", value: "#ff00ff" },
        ],
        stats: { hp: 75, speed: 170, cooldown: 4000 }, // Buffed Speed
      },
      {
        id: 7,
        name: "Medic",
        price: 550,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffc0cb" },
          { name: "Combat", value: "#2e8b57" },
        ],
        stats: { hp: 130, speed: 110, cooldown: 7000 },
      },
      {
        id: 8,
        name: "Ghost",
        price: 700,
        class: "Speed",
        skins: [
          { name: "Default", value: "#add8e6" },
          { name: "Phantom", value: "#4b0082" },
        ],
        stats: { hp: 80, speed: 160, cooldown: 5000 }, // Buffed Speed
      },
      {
        id: 9,
        name: "Frost",
        price: 650,
        class: "Damage",
        skins: [
          { name: "Default", value: "#e0ffff" },
          { name: "Deep Ice", value: "#00008b" },
        ],
        stats: { hp: 120, speed: 105, cooldown: 8000 },
      },
      {
        id: 10,
        name: "Sniper",
        price: 950,
        class: "Damage",
        skins: [
          { name: "Default", value: "#8b4513" },
          { name: "Camo", value: "#556b2f" },
        ],
        stats: { hp: 90, speed: 100, cooldown: 10000 },
      },
      {
        id: 11,
        name: "Brawler",
        price: 350,
        class: "Tank",
        skins: [
          { name: "Default", value: "#b22222" },
          { name: "Street", value: "#483d8b" },
        ],
        stats: { hp: 210, speed: 80, cooldown: 8000 }, // NERFED HP/Speed, Higher CD for Slam
      },
      {
        id: 12,
        name: "Engineer",
        price: 600,
        class: "Support",
        skins: [
          { name: "Default", value: "#ffa500" },
          { name: "Cyber", value: "#00ced1" },
        ],
        stats: { hp: 150, speed: 100, cooldown: 6000 },
      },
      {
        id: 13,
        name: "Shadow",
        price: 750,
        class: "Damage",
        skins: [
          { name: "Default", value: "#2f4f4f" },
          { name: "Void", value: "#000000" },
        ],
        stats: { hp: 105, speed: 120, cooldown: 5500 },
      },
      {
        id: 14,
        name: "Goliath",
        price: 800,
        class: "Tank",
        skins: [
          { name: "Default", value: "#808000" },
          { name: "Mecha", value: "#c0c0c0" },
        ],
        stats: { hp: 320, speed: 65, cooldown: 9000 },
      },
      {
        id: 15,
        name: "Nova",
        price: 850,
        class: "Damage",
        skins: [
          { name: "Default", value: "#9932cc" },
          { name: "Supernova", value: "#ff1493" },
        ],
        stats: { hp: 100, speed: 115, cooldown: 4500 },
      },
      // --- NEW HEROES ---
      {
        id: 16,
        name: "Citadel",
        price: 1200,
        class: "Tank",
        skins: [
            { name: "Default", value: "#708090" },
            { name: "Fortress", value: "#2f4f4f" }
        ],
        stats: { hp: 350, speed: 50, cooldown: 10000 }
      },
      {
        id: 17,
        name: "Magma",
        price: 1150,
        class: "Tank",
        skins: [
            { name: "Default", value: "#ff4500" },
            { name: "Obsidian", value: "#3b3b3b" }
        ],
        stats: { hp: 260, speed: 80, cooldown: 8000 }
      },
      {
        id: 18,
        name: "Storm",
        price: 1300,
        class: "Damage",
        skins: [
            { name: "Default", value: "#4682b4" },
            { name: "Thunder", value: "#ffff00" }
        ],
        stats: { hp: 110, speed: 115, cooldown: 6000 }
      },
      {
        id: 19,
        name: "Viper",
        price: 1250,
        class: "Damage",
        skins: [
            { name: "Default", value: "#32cd32" },
            { name: "Cobra", value: "#006400" }
        ],
        stats: { hp: 105, speed: 120, cooldown: 5000 }
      },
      {
        id: 20,
        name: "Mirage",
        price: 1500,
        class: "Speed",
        skins: [
            { name: "Default", value: "#9370db" },
            { name: "Illusion", value: "#e6e6fa" }
        ],
        stats: { hp: 80, speed: 165, cooldown: 5000 }
      },
      {
        id: 21,
        name: "Jumper",
        price: 1400,
        class: "Speed",
        skins: [
            { name: "Default", value: "#00fa9a" },
            { name: "Quantum", value: "#48d1cc" }
        ],
        stats: { hp: 75, speed: 170, cooldown: 4000 }
      }
    ];

    await Hero.bulkCreate(heroes, {
      updateOnDuplicate: ["name", "price", "stats", "class", "skins"],
    });
    console.log("Heroes seeded successfully!");

    // --- SEED ADMIN USER ---
    const adminUsername = "CommandantX";
    const adminPassword = "NeonPrime2077!";
    const adminEmail = "admin@cyber-royale.io";

    const existingAdmin = await User.findOne({
      where: { username: adminUsername },
    });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        isAdmin: true,
        coins: 999999, // Admin perk
      });
      console.log("Admin user created: " + adminUsername);
    } else {
      // Ensure admin rights
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      existingAdmin.isAdmin = true;
      existingAdmin.coins = 999999;
      existingAdmin.password = hashedPassword;
      await existingAdmin.save();
      console.log("Admin user updated (Password reset).");
    }
    // -----------------------

    // Only exit if run directly
    if (require.main === module) {
      process.exit(0);
    }
  } catch (error) {
    console.error("Seeding failed:", error);
    if (require.main === module) {
      process.exit(1);
    }
  }
}

// Run if called directly: node seed.js
if (require.main === module) {
  seed();
}

module.exports = seed;
