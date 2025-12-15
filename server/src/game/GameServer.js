const Player = require("./Player");
const { Hero, User } = require("../models");
const MapData = require("./MapData");
const jwt = require("jsonwebtoken");


class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.projectiles = [];
    this.projectiles = [];
    this.entities = []; // Mines, etc.
    this.disconnectedPlayers = new Map(); // Store { username, player, timeout }

    this.io.on("connection", (socket) => {
      console.log("Player connected:", socket.id);

      socket.on("join_game", async ({ heroId, username, skinColor, token }) => {
        // SECURITY: Verify Token to prevent Username Spoofing via LocalStorage
        if (token) {
            try {
                // DEBUG LOGGING
                // console.log("Verifying token:", token.substring(0, 10) + "...");
                const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret_key");
                
                if (decoded && decoded.id) {
                    // Token contains { id: ... } (See auth.js)
                    // We must fetch the User to get the Username
                    const dbUser = await User.findByPk(decoded.id);
                    if (dbUser) {
                        username = dbUser.username;
                        console.log(`[AUTH] Verified user via Token ID: ${username}`);
                    } else {
                        console.warn("[AUTH] Token valid but user ID not found in DB");
                        username = "Unknown";
                    }
                } else if (decoded && decoded.username) {
                     // Fallback for legacy tokens if any
                     username = decoded.username;
                }
            } catch (err) {
                console.warn(`[AUTH] Invalid Token for ${socket.id}: ${err.message}`);
                username = "Unknown"; // Force Guest
            }

        } else {
             username = "Unknown"; // No Token = Guest
        }

        // SECURITY: Prevent Hero Switching while active
        // SECURITY: Prevent Hero Switching while active
        if (this.players.has(socket.id)) {
            return;
        }

        // Fetch hero stats from DB
        try {
          let hero = await Hero.findByPk(heroId);
          
          // SECURITY: Verify Ownership (Strict)
          let isAllowed = false;
          let user = null; // Declare in wider scope

          if (hero && hero.price === 0) {
              isAllowed = true; // Free heroes are always allowed
          } else if (hero && username && username !== "Unknown") {
             user = await User.findOne({ 
                where: { username },
                include: [{ model: Hero, as: "unlockedHeroes" }]
             });
             
             if (user) {
                // Check if user actually owns this paid hero
                if (user.unlockedHeroes.some(h => h.id === hero.id)) {
                    isAllowed = true;
                }
             }
          }

          if (hero && !isAllowed) {
             console.warn(`[SECURITY] User ${username} tried to use unauthorized hero ${hero.name}.`);
             
             // Fallback Logic: Try "Previous/Equipped" Hero
             let fallbackHeroId = 1; // Default
             if (user && user.equippedHeroId) {
                  // Verify user owns their equipped hero too (sanity check)
                  if (!user.unlockedHeroes) { // Re-check if needed, but we have it from include above
                       // Should be loaded
                  }
                  // Check if equippedHeroId is valid owned hero
                   if (user.unlockedHeroes.some(h => h.id === user.equippedHeroId)) {
                        fallbackHeroId = user.equippedHeroId;
                        console.log(`[SECURITY] Reverting to Last Equipped Valid Hero (ID: ${fallbackHeroId})`);
                   }
             }
             
             hero = await Hero.findByPk(fallbackHeroId); 
             if (!hero) hero = await Hero.findOne({ where: { price: 0 } });
          }

          if (hero) {
            // Check Reconnection
            let restored = false;
            if (username && username !== "Unknown") {
               const saved = this.disconnectedPlayers.get(username);
               // Check if same Hero (Use verified hero.id)
               if (saved && saved.player.hero.id == hero.id) {
                 // Restore State
                 clearTimeout(saved.timeout);
                 this.disconnectedPlayers.delete(username);
                 
                 const p = saved.player;
                 const oldId = p.id; // Capture old ID
                 p.id = socket.id; // Update Socket ID
                 p.keys = { w: false, a: false, s: false, d: false, space: false }; // Reset inputs
                 
                 // Transfer ownership of Mines/Projectiles
                 this.entities.forEach(ent => {
                    if (ent.ownerId === oldId) ent.ownerId = socket.id;
                 });
                 this.projectiles.forEach(proj => {
                    if (proj.ownerId === oldId) proj.ownerId = socket.id;
                 });

                 this.players.set(socket.id, p);
                 restored = true;
                 console.log(`Restored session for ${username}`);
               }
            }

            if (!restored) {
               this.players.set(
                socket.id,
                new Player(socket.id, hero.toJSON(), username, skinColor)
               );
               const player = this.players.get(socket.id);
               const spawn = this.getSafeSpawn();
               player.x = spawn.x;
               player.y = spawn.y;
            }
            
            socket.join("game_room");
            // Send initial Game State AND Map Data
            socket.emit("game_init", {
              map: MapData,
              playerId: socket.id,
            });
          }
        } catch (e) {
          console.error(e);
        }
      });

      socket.on("client_input", (inputData) => {
        const player = this.players.get(socket.id);
        if (player) {
          player.keys = inputData.keys;
          player.mouseAngle = inputData.mouseAngle;
        }
      });

      socket.on("skill_trigger", () => {
        const player = this.players.get(socket.id);
        if (player) {
          const result = player.useSkill();
          if (result) {
            const items = Array.isArray(result) ? result : [result];
            items.forEach((item) => {
              if (item.type === "MINE") {
                this.entities.push(item);
                // Mine Lifetime
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "WALL_TEMP") {
                // Temporary Wall
                this.entities.push(item);
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "PROJECTILE") {
                this.projectiles.push(item);
              } else if (item.type === "DECOY") {
                 this.entities.push(item);
                 setTimeout(() => {
                   const idx = this.entities.indexOf(item);
                   if (idx > -1) this.entities.splice(idx, 1);
                 }, item.life);
              } else if (item.type === "SHOCKWAVE") {
                 // Immediate AoE Effect
                 for (const [pid, p] of this.players) {
                    if (pid === item.ownerId) continue;
                    if (p.isDead) continue;
                    
                    const dx = p.x - item.x;
                    const dy = p.y - item.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist < item.radius) {
                        // Apply Knockback
                        const angle = Math.atan2(dy, dx);
                        const force = item.knockback;
                        
                        // Simple wall collision check for knockback (optional, but good for stability)
                        let nx = p.x + Math.cos(angle) * force;
                        let ny = p.y + Math.sin(angle) * force;
                        
                        // Update Position
                        p.x = Math.max(0, Math.min(1600, nx));
                        p.y = Math.max(0, Math.min(1200, ny));
                        
                        // Apply Damage
                        p.hp -= item.damage;
                        
                        // Check Death (Reuse death logic or let main loop handle it? Main loop handles it safer)
                        // But we want kill credit immediately if possible.
                        // For simplicity, let the main loop cleanup 'hp <= 0'
                        if (p.hp <= 0) {
                             const killer = this.players.get(item.ownerId);
                             if (killer) {
                                  killer.kills++;
                                  killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                                  this.awardCoins(killer.username, 50);
                                  this.io.to(item.ownerId).emit("kill_confirmed", { victim: p.username || p.hero.name });
                                  p.killedBy = killer.username;
                                  p.killedByHero = killer.hero.name;
                             }
                        }
                    }
                 }
                 // Emulate Visual Explosion
                 this.io.emit("visual_effect", { type: "shockwave", x: item.x, y: item.y, radius: item.radius, color: item.color });
              }
            });
          }
        }
      });

      socket.on("disconnect", () => {
        const p = this.players.get(socket.id);
        if (p) {
           this.players.delete(socket.id);
           
           // Save State if User is known
           if (p.username && p.username !== "Unknown") {
              // 15 Seconds Grace Period
              const timeout = setTimeout(() => {
                 this.disconnectedPlayers.delete(p.username);
                 // Cleanup Entities (Mines/Walls) for permanently disconnected player
                 // Remove items owned by the old socket ID
                 for (let i = this.entities.length - 1; i >= 0; i--) {
                    if (this.entities[i].ownerId === socket.id) {
                        this.entities.splice(i, 1);
                    }
                 }
              }, 15000);
              
              this.disconnectedPlayers.set(p.username, {
                 player: p,
                 timeout
              });
           }
        }
      });
    });

    this.startGameLoop();
  }

  startGameLoop() {
    setInterval(() => {
      const dt = 0.03; // 30ms

      const state = {
        players: [],
        entities: this.entities,
        projectiles: this.projectiles,
      };

      // 1. Update Players & Handle Shooting
      this.players.forEach((player) => {
        // Respawn Logic
        if (player.isDead) {
          if (Date.now() > player.respawnTime) {
             // Respawn Now - Restore Stats
             player.isDead = false;
             player.hp = player.maxHp;
             // Coordinates already set at death time
             player.cooldowns.skill = 0;
             player.cooldowns.shoot = 0;
             player.freezeEndTime = 0;
             player.isFrozen = false;
             player.killedBy = null;
             player.killedByHero = null;
          } else {
             // Still dead, send state but skip update

             state.players.push({
                id: player.id,
                x: player.x,
                y: player.y,
                hp: 0, 
                maxHp: player.maxHp,
                hero: player.hero.name,
                heroClass: player.hero.class,
                color: player.color,
                angle: player.mouseAngle,
                shield: false,
                invisible: false,
                isFrozen: false,
                isDead: true,
                killedBy: player.killedBy,
                killedByHero: player.killedByHero,
                respawnTime: player.respawnTime,

                skillCD: 0,
                username: player.username,
                maxSkillCD: player.hero.stats.cooldown,
                kills: player.kills,
             });
             return; 
          }
        }

        player.update(dt);

        // Shoot check
        // Shoot check
        if (player.keys.space) {
          const proj = player.shoot();
          if (proj) {
            if (player.isPoisonous) {
                proj.isPoison = true; 
                proj.color = "#32cd32"; // FORCE GREEN VISUAL
            }
            this.projectiles.push(proj);
          }
        }

        state.players.push({
          id: player.id,
          x: player.x,
          y: player.y,
          hp: player.hp,
          maxHp: player.maxHp,
          hero: player.hero.name,
          heroClass: player.hero.class, // Send Class for rendering
          color: player.color, // Send unique color
          angle: player.mouseAngle,
          shield: player.shieldActive,
          invisible: player.isInvisible, // Send stealth state
          isFrozen: player.isFrozen, // Send frozen state
          isPhasing: player.isPhasing,
          rapidFire: player.rapidFire,
          isRooted: player.isRooted,
          isSkillActive: player.isSkillActive,
          isSkillActive: player.isSkillActive,
          freezeEndTime: player.freezeEndTime || 0,
          isPoisoned: player.isPoisoned, // SEND TO CLIENT
          skillCD: player.cooldowns.skill,
          username: player.username,
          maxSkillCD: player.hero.stats.cooldown,
          kills: player.kills,
        });
      });

      // 2. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1000;

        // Basic Bounds/Lifespan check
        if (p.life <= 0 || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1200) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision with Map Obstacles (Walls)
        let hitWall = false;
        const pRect = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 }; // Approx projectile size
        for (const obs of MapData.obstacles) {
          // Check if bullet overlaps with obstacle
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            hitWall = true;
            break;
          }
        }

        if (hitWall) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision check with players
        for (const [id, player] of this.players) {
          if (p.ownerId === id) continue; // Don't hit self
          if (player.isDead) continue; // Ghost Mode: Bullets pass through dead players


          // Simple Circle Collision
          const dx = p.x - player.x;
          const dy = p.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 25) {
            // Collision
            // Check Shield
            if (player.shieldActive) {
              this.projectiles.splice(i, 1);
              hitWall = true;
              break; // Blocked
            }
            if (player.isInvincible) {
                this.projectiles.splice(i, 1);
                hitWall = true;
                break; // Blocked by Fortress
            }

            // Apply Damage
            let damage = p.damage || 15;

            // FREEZE EFFECT
            if (p.effect === "FREEZE") {
              player.isFrozen = true;
              player.speed = 0;
              player.freezeEndTime = Date.now() + 2000; // Track end time for client animation

              // Clear existing freeze timeout if any (not tracking ID for now, just overwrite)
              setTimeout(() => {
                player.isFrozen = false;
                player.speed = player.baseSpeed;
                player.freezeEndTime = 0;
              }, 2000); // Freeze for 2 seconds
            }
            
            // POISON EFFECT (VIPER)
            if (p.isPoison) {
                damage += 25; 
                player.speed = player.baseSpeed * 0.4; 
                player.isPoisoned = true; // Flag for Client Visuals
                
                if (player.poisonTimeout) clearTimeout(player.poisonTimeout);
                
                player.poisonTimeout = setTimeout(() => {
                    player.speed = player.baseSpeed;
                    player.isPoisoned = false; // Turn off visual
                    player.poisonTimeout = null;
                }, 3000);

                // Initial Hit Effect
                this.io.emit("visual_effect", {
                    type: "poison_hit",
                    targetId: player.id,
                    x: player.x,
                    y: player.y
                });
            }

            player.hp -= damage;
            this.projectiles.splice(i, 1);

            // Handle Death
            if (player.hp <= 0) {
              const killer = this.players.get(p.ownerId);
              if (killer) {
                killer.kills++;
                killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                this.awardCoins(killer.username, 50);
                // NOTIFY KILLER
                this.io.to(p.ownerId).emit("kill_confirmed", { victim: player.username || player.hero.name });
              }
              // TRIGGER DEATH
              const deathX = player.x;
              const deathY = player.y;
              player.hp = 0;
              player.isDead = true;
              const kName = killer ? (killer.username || "Unknown") : "Unknown";
              const hName = (killer && killer.hero) ? (killer.hero.name || killer.hero) : "?";
              player.killedBy = kName;
              player.killedByHero = typeof hName === 'string' ? hName : "?";
              player.isFrozen = false; // Clear Frost
              player.freezeEndTime = 0;
              player.respawnTime = Date.now() + 5000; // 5 Seconds
              // Teleport to safe zone immediately (Invisible)
              const spawn = this.getSafeSpawn();
              player.x = spawn.x;
              player.y = spawn.y;
              
              // Explosion Event
              this.io.to("game_room").emit("player_died", { x: deathX, y: deathY, color: player.color });
            }
            break; // Projectile destroyed
          }
        }
      }

      // 3. Update Entities (Mines)
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];

        // Simple collision with any player (even owner? maybe delay arming? for MVP instant arm)
        for (const [id, player] of this.players) {
          // Optional: Don't hit owner immediately? Let's say mines are dangerous to everyone OR just enemies
          // Optional: Don't hit owner immediately? Let's say mines are dangerous to everyone OR just enemies
          if (ent.ownerId === id) continue;
          if (player.isDead) continue; // Ghost Mode


          const dx = ent.x - player.x;
          const dy = ent.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 30) {
            // Mine radius approx 12 + player 20
            // EXPLODE
            player.hp -= 40; // Big damage
            this.entities.splice(i, 1);

            if (player.hp <= 0) {
              const killer = this.players.get(ent.ownerId);
              if (killer) {
                this.awardCoins(killer.username, 50);
                // NOTIFY KILLER (Mine)
                this.io.to(ent.ownerId).emit("kill_confirmed", { victim: player.username || player.hero.name });
              }
              // TRIGGER DEATH
              const deathX = player.x;
              const deathY = player.y;
              player.hp = 0;
              player.isDead = true;
              const kName = killer ? (killer.username || "Unknown") : "Unknown";
              const hName = (killer && killer.hero) ? (killer.hero.name || killer.hero) : "?";
              player.killedBy = kName;
              player.killedByHero = typeof hName === 'string' ? hName : "?";
              player.isFrozen = false; // Clear Frost
              player.freezeEndTime = 0;
              player.respawnTime = Date.now() + 5000;
              // Teleport to safe zone immediately (Invisible)
              const spawn = this.getSafeSpawn();
              player.x = spawn.x;
              player.y = spawn.y;
              
              // Explosion Event
              this.io.to("game_room").emit("player_died", { x: deathX, y: deathY, color: player.color });
            }
            break;
          }
        }
      }

      // Emit to room
      this.io.to("game_room").emit("server_update", state);
    }, 30);
  }
  async awardCoins(username, amount) {
    try {
      const user = await User.findOne({ where: { username } });
      if (user) {
        user.coins += amount;
        user.kills += 1; // Increment global kill count
        await user.save();
      }
    } catch (e) {
      console.error("Coin reward failed", e);
    }
  }

  getSafeSpawn() {
    let safe = false;
    let x, y;
    let attempts = 0;
    while (!safe && attempts < 100) {
      // Increase edge padding to 100 to avoid border walls
      x = 100 + Math.random() * (MapData.width - 200);
      y = 100 + Math.random() * (MapData.height - 200);

      let collision = false;
      // Increase hitbox check to 80x80 (radius 40 effective) to be very safe
      const pRect = { x: x - 40, y: y - 40, w: 80, h: 80 };

      for (const obs of MapData.obstacles) {
        if (
          pRect.x < obs.x + obs.w &&
          pRect.x + pRect.w > obs.x &&
          pRect.y < obs.y + obs.h &&
          pRect.y + pRect.h > obs.y
        ) {
          collision = true;
          break;
        }
      }
      if (!collision) safe = true;
      attempts++;
    }

    // Fallback if 100 attempts failed (should process safe logic or return defaults)
    if (!safe) {
      return { x: 100, y: 100 }; // Default safe corner
    }
    return { x, y };
  }
}

module.exports = GameServer;
