const Player = require("./Player");
const { Hero, User } = require("../models");
const MapData = require("./MapData");
const BattleRoyaleManager = require("./BattleRoyaleManager");
const jwt = require("jsonwebtoken");

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.projectiles = [];
    this.projectiles = [];
    this.entities = []; // Mines, etc.
    this.disconnectedPlayers = new Map(); // Store { username, player, timeout }
    this.brManager = new BattleRoyaleManager(io, this);

    this.io.on("connection", (socket) => {
      console.log("Player connected:", socket.id);

      socket.on(
        "join_game",
        async ({ heroId, username, skinColor, token, mode }) => {
          // Mode Selection

          // SECURITY: Verify Token to prevent Username Spoofing via LocalStorage
          if (token) {
            try {
              // DEBUG LOGGING
              // console.log("Verifying token:", token.substring(0, 10) + "...");
              const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || "default_secret_key"
              );

              if (decoded && decoded.id) {
                // Token contains { id: ... } (See auth.js)
                // We must fetch the User to get the Username
                const dbUser = await User.findByPk(decoded.id);
                if (dbUser) {
                  username = dbUser.username;
                  console.log(`[AUTH] Verified user via Token ID: ${username}`);
                } else {
                  console.warn(
                    "[AUTH] Token valid but user ID not found in DB"
                  );
                  username = "Unknown";
                }
              } else if (decoded && decoded.username) {
                // Fallback for legacy tokens if any
                username = decoded.username;
              }
            } catch (err) {
              console.warn(
                `[AUTH] Invalid Token for ${socket.id}: ${err.message}`
              );
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

          // === GLOBAL SINGLE SESSION ENFORCEMENT ===
          if (username && username !== "Unknown") {
            // 1. Check Arena
            for (const [pid, p] of this.players) {
              if (p.username === username) {
                const oldSocket = this.io.sockets.sockets.get(pid);
                if (oldSocket) {
                  oldSocket.emit("error_message", "Logged in from another location.");
                  oldSocket.disconnect(true);
                }
                this.players.delete(pid);
              }
            }
            // 2. Check BR (Queue & Active)
            this.brManager.forceRemovePlayer(username);
          }
          // =========================================

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
                include: [{ model: Hero, as: "unlockedHeroes" }],
              });

              if (user) {
                // Check if user actually owns this paid hero
                if (user.unlockedHeroes.some((h) => h.id === hero.id)) {
                  isAllowed = true;
                }
              }
            }

            if (hero && !isAllowed) {
              console.warn(
                `[SECURITY] User ${username} tried to use unauthorized hero ${hero.name}.`
              );

              // Fallback Logic: Try "Previous/Equipped" Hero
              let fallbackHeroId = 1; // Default
              if (user && user.equippedHeroId) {
                // Verify user owns their equipped hero too (sanity check)
                if (!user.unlockedHeroes) {
                  // Re-check if needed, but we have it from include above
                  // Should be loaded
                }
                // Check if equippedHeroId is valid owned hero
                if (
                  user.unlockedHeroes.some((h) => h.id === user.equippedHeroId)
                ) {
                  fallbackHeroId = user.equippedHeroId;
                  console.log(
                    `[SECURITY] Reverting to Last Equipped Valid Hero (ID: ${fallbackHeroId})`
                  );
                }
              }

              hero = await Hero.findByPk(fallbackHeroId);
              if (!hero) hero = await Hero.findOne({ where: { price: 0 } });
            }

            if (hero) {
              // Battle Royale Join
              if (mode === "battle_royale") {
                this.brManager.joinQueue(socket, {
                  id: socket.id,
                  hero: hero.toJSON(),
                  username,
                  skinColor,
                });
                return; // Stop here, don't join Arena
              }

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
                  p.keys = {
                    w: false,
                    a: false,
                    s: false,
                    d: false,
                    space: false,
                  }; // Reset inputs

                  // Transfer ownership of Mines/Projectiles
                  this.entities.forEach((ent) => {
                    if (ent.ownerId === oldId) ent.ownerId = socket.id;
                  });
                  this.projectiles.forEach((proj) => {
                    if (proj.ownerId === oldId) proj.ownerId = socket.id;
                  });

                  this.players.set(socket.id, p);
                  restored = true;
                  console.log(`Restored session for ${username}`);
                }
              }

              if (!restored) {
                // UNIQUE USERNAME CHECK (Security)
                // Iterate existing players to find duplicates
                for (const [pid, p] of this.players) {
                  if (p.username === username) {
                    // Found a duplicate! Kick the OLD active player.
                    // This prevents "stuck" names and allows the user to re-login.
                    const oldSocket = this.io.sockets.sockets.get(pid);
                    if (oldSocket) {
                      oldSocket.emit(
                        "error_message",
                        "Logged in from another location."
                      );
                      oldSocket.disconnect(true);
                    }
                    this.players.delete(pid);
                  }
                }

                const newPlayer = new Player(
                  socket.id,
                  hero.toJSON(),
                  username,
                  skinColor
                );

                // Set Arena Map Context
                newPlayer.mapLimits = {
                  width: MapData.width,
                  height: MapData.height,
                };
                newPlayer.currentMapObstacles = MapData.obstacles;

                this.players.set(socket.id, newPlayer);
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
        }
      );

      socket.on("client_input", (inputData) => {
        // Check Arena
        const player = this.players.get(socket.id);
        if (player) {
          player.keys = inputData.keys;
          player.mouseAngle = inputData.mouseAngle;
        } else {
          // Check BR
          this.brManager.handleInput(socket.id, inputData);
        }
      });

      socket.on("skill_trigger", () => {
        // Check BR First (or Arena)
        if (this.brManager.players.has(socket.id)) {
          this.brManager.handleSkill(socket.id);
          return;
        }

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
              } else if (
                item.type === "PROJECTILE" ||
                item.type === "LAVA_WAVE" ||
                item.type === "MARKER_SHOT" ||
                item.type === "BLACK_HOLE_SHOT"
              ) {
                this.projectiles.push(item);
              } else if (item.type === "HEALING_STATION") {
                this.entities.push(item);
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
              } else if (item.type === "DECOY") {
                this.entities.push(item);
                setTimeout(() => {
                  const idx = this.entities.indexOf(item);
                  if (idx > -1) this.entities.splice(idx, 1);
                }, item.life);
                // SUPERNOVA LOGIC (Triggered by Player State)
              } else if (item.type === "SHOCKWAVE" || item.type === "GRAVITY_SLAM") {
                // Immediate AoE Effect
                for (const [pid, p] of this.players) {
                  if (pid === item.ownerId) continue;
                  if (p.isDead) continue;

                  const dx = p.x - item.x;
                  const dy = p.y - item.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);

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
                    p.takeDamage(item.damage);

                    // Check Death (Reuse death logic or let main loop handle it? Main loop handles it safer)
                    // But we want kill credit immediately if possible.
                    // For simplicity, let the main loop cleanup 'hp <= 0'
                    if (p.hp <= 0) {
                      const killer = this.players.get(item.ownerId);
                      if (killer) {
                        killer.kills++;
                        killer.hp = Math.min(killer.maxHp, killer.hp + 50);
                        this.awardCoins(killer.username, 50);
                        this.io.to(item.ownerId).emit("kill_confirmed", {
                          victim: p.username || p.hero.name,
                        });
                        p.killedBy = killer.username;
                        p.killedByHero = killer.hero.name;
                      }
                    }
                  }
                }
                // Emulate Visual Explosion
                this.io.emit("visual_effect", {
                  type: "shockwave",
                  x: item.x,
                  y: item.y,
                  radius: item.radius,
                  color: item.color,
                });

                // GRAVITY SLAM SLOW (Special Case)
                if (item.type === "GRAVITY_SLAM") {
                  this.players.forEach((p) => {
                    if (p.id === item.ownerId) return;
                    const dx = p.x - item.x;
                    const dy = p.y - item.y;
                    if (Math.sqrt(dx * dx + dy * dy) < item.radius) {
                      if (!p.isSlowed) {
                        p.isSlowed = true;
                        const originalSpeed = p.speed; // This might be buggy if they were already buffed/nerfed. Uses baseSpeed is safer but might override buffs.
                        // Let's use baseSpeed factor
                        p.speed = p.baseSpeed * 0.2;
                        setTimeout(() => {
                          p.speed = p.baseSpeed;
                          p.isSlowed = false;
                        }, 2000);
                      }
                    }
                  });
                }
              }
            });
          }
        }
      });

      socket.on("leave_queue", () => {
        this.brManager.leaveQueue(socket);
      });

      socket.on("disconnect", () => {
        this.brManager.handleDisconnect(socket);
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
              timeout,
            });
          }
        }
      });
    });

    // Start Loops
    this.startGameLoop();
  }

  handlePlayerDeath(player, killerId) {
    const killer = this.players.get(killerId);
    if (killer) {
      killer.kills++;
      killer.hp = Math.min(killer.maxHp, killer.hp + 50);
      this.awardCoins(killer.username, 50);
      // NOTIFY KILLER
      this.io.to(killerId).emit("kill_confirmed", {
        victim: player.username || player.hero.name,
      });
    }
    // TRIGGER DEATH
    const deathX = player.x;
    const deathY = player.y;
    player.hp = 0;
    player.isDead = true;
    const kName = killer ? killer.username || "Unknown" : "Unknown";
    const hName = killer && killer.hero ? killer.hero.name || killer.hero : "?";
    player.killedBy = kName;
    player.killedByHero = typeof hName === "string" ? hName : "?";
    player.isFrozen = false; // Clear Frost
    player.freezeEndTime = 0;
    player.respawnTime = Date.now() + 5000; // 5 Seconds
    // Teleport to safe zone immediately (Invisible)
    const spawn = this.getSafeSpawn();
    player.x = spawn.x;
    player.y = spawn.y;

    // Explosion Event
    this.io.to("game_room").emit("player_died", {
      x: deathX,
      y: deathY,
      color: player.color, // Fixed access
    });
  }

  startGameLoop() {
    setInterval(() => {
      const dt = 0.03; // 30ms

      // Update Battle Royale
      this.brManager.update(dt);

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

        // SUPERNOVA LOGIC (Delayed Explosion)
        if (player.supernovaStartTime) {
          if (Date.now() - player.supernovaStartTime >= 500) {
            // BOOM!
            delete player.supernovaStartTime;

            // RESET COOLDOWN (Red 8s)
            // Removes the "Yellow Infinite" state immediately
            player.cooldowns.skill = 8000;

            // Visual
            this.io.to("game_room").emit("visual_effect", {
              type: "supernova_cast", // Just a flash/sound trigger
              x: player.x,
              y: player.y,
            });

            // Blast Wave
            const blastRadius = 400;

            // Emit Blast Visual
            this.io.to("game_room").emit("visual_effect", {
              type: "supernova_blast",
              x: player.x,
              y: player.y,
              radius: blastRadius,
            });

            // Damage & Knockback
            for (const [pid, target] of this.players) {
              if (pid === player.id) continue;
              if (target.isDead) continue;

              const dx = target.x - player.x;
              const dy = target.y - player.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < blastRadius) {
                // SCALED DAMAGE (User Request: "loin moins degat, pres oneshot")

                let dmg = 0;

                // 1. ONE SHOT (Collé / Très proche) -> < 60 unités
                if (dist < 80) {
                  // Un peu plus généreux que 60 pour le "collé"
                  dmg = 9999; // INSTANT KILL
                } else {
                  // 2. SCALED DAMAGE (Plus loin = Moins de dégats)
                  // Distance range: [80, 400]
                  // Damage range: [120, 30]

                  const maxScaledDmg = 100; // Nerfed from 120
                  const minScaledDmg = 10; // Nerfed from 30

                  // Normalize distance from 0.0 (at 80) to 1.0 (at 400)
                  const ratio = (dist - 80) / (blastRadius - 80);
                  const clampedRatio = Math.max(0, Math.min(1, ratio));

                  dmg =
                    maxScaledDmg - clampedRatio * (maxScaledDmg - minScaledDmg);
                }

                target.takeDamage(Math.floor(dmg));

                // Safe Push Logic (Raycast against Obstacles)
                const angle = Math.atan2(dy, dx);
                const maxForce = 1000 * (1 - dist / blastRadius) + 200;
                const steps = 8;
                const stepDist = maxForce / steps;
                
                let safeX = target.x;
                let safeY = target.y;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                
                const obstacles = MapData.obstacles || [];

                for (let s = 1; s <= steps; s++) {
                    const checkX = target.x + cos * (stepDist * s);
                    const checkY = target.y + sin * (stepDist * s);
                    let hitsWall = false;
                    
                    // Map Bounds
                    if (checkX < 50 || checkX > MapData.width - 50 || checkY < 50 || checkY > MapData.height - 50) hitsWall = true;
                    
                    // Obstacles
                    if (!hitsWall) {
                        for (const obs of obstacles) {
                            if (checkX > obs.x && checkX < obs.x + obs.w &&
                                checkY > obs.y && checkY < obs.y + obs.h) {
                                hitsWall = true;
                                break;
                            }
                        }
                    }
                    
                    if (hitsWall) break;
                    safeX = checkX;
                    safeY = checkY;
                }
                target.x = safeX;
                target.y = safeY;

                // Kill Check
                if (target.hp <= 0 && !target.isDead) {
                  const killer = this.players.get(player.id);
                  if (killer) killer.kills++;
                  target.isDead = true;
                  target.respawnTime = Date.now() + 5000;
                  this.io.emit("player_died", { id: pid, killerId: player.id });
                }
              }
            }
          }
        }

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
          isSkillActive: player.isSkillActive,
          freezeEndTime: player.freezeEndTime || 0,
          isPoisoned: player.isPoisoned, // SEND TO CLIENT
          isMarked: player.isMarked,
          skillCD: player.cooldowns.skill,
          username: player.username,
          maxSkillCD: player.hero.stats.cooldown,
          kills: player.kills,
        });
      });

      // --- UPDATE ENTITIES (Mines, Decoys) ---
      // BLACK HOLE REMOVED (Replaced by Supernova Skill)
      for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];
        if (ent.type === "MINE") {
          // Mine Logic... (Keep existing)
          // Simple proximity check
          for (const [pid, p] of this.players) {
            if (pid === ent.ownerId) continue;
            if (p.isDead) continue;
            const dx = ent.x - p.x;
            const dy = ent.y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < 30) {
              // BOOM
              p.takeDamage(50);
              // ... emit effect
              this.entities.splice(i, 1);
              // ... kill check
              if (p.hp <= 0 && !p.isDead) {
                p.isDead = true;
                p.respawnTime = Date.now() + 5000;
                this.io.emit("player_died", { id: pid, killerId: ent.ownerId });
              }
              break;
            }
          }
        } else if (ent.type === "HEALING_STATION") {
          // Heal nearby allies
          for (const [pid, p] of this.players) {
            if (p.isDead) continue;
            // Allow self-heal and team heal logic (For now, heal everyone or just self? Let's say Friendly Fire is OFF, so heal Self + maybe concept of teams later?
            // For FFA, heal ONLY owner? Or heal anyone nearby?
            // Usually Support heals allies. In FFA, maybe it heals anyone?
            // Let's make it heal OWNER and anyone else (Risky in FFA).
            // Safe bet: Heal Owner, and maybe allies if we had teams.
            // Re-reading request: "Support". implies helping others.
            // Let's heal everyone nearby for chaos/fun or just owner.
            // Code: Heal nearby players.
            const dx = ent.x - p.x;
            const dy = ent.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < ent.radius) {
              if (p.hp < p.maxHp) {
                p.hp = Math.min(p.maxHp, p.hp + ent.healRate * dt);
              }
            }
          }
        }
      }

      // 2. Update Projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];

        // BLACK HOLE SHOT REMOVED (Replaced by Supernova)

        // Standard Projectile Physics
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1000;

        // BOOMERANG LOGIC (Aegis)
        if (p.type === "BOOMERANG") {
          const owner = this.players.get(p.ownerId);
          if (owner) {
            const dx = p.x - owner.x;
            const dy = p.y - owner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!p.returning) {
              if (dist > (p.maxDist || 400)) {
                p.returning = true;
                // Reset hit list to allow hitting enemies again on way back
                p.hitTargets = [];
              }
            } else {
              // Homing Return
              const angle = Math.atan2(owner.y - p.y, owner.x - p.x);
              const returnSpeed = 1200;
              p.vx = Math.cos(angle) * returnSpeed;
              p.vy = Math.sin(angle) * returnSpeed;

              if (dist < 30) {
                this.projectiles.splice(i, 1);
                continue; // Caught
              }
            }
          }

          // BLOCK BULLETS (Destroy enemy projectiles)
          for (const other of this.projectiles) {
            if (other === p) continue;
            if (other.ownerId === p.ownerId) continue; // Don't block ally shots
            if (other.type === "BOOMERANG") continue; // Don't block other boomerangs?

            const pdx = p.x - other.x;
            const pdy = p.y - other.y;
            const pDist = Math.sqrt(pdx * pdx + pdy * pdy);

            if (pDist < p.radius + 15) { // Radius check
              other.life = -1; // Destroy enemy bullet
              // Visual Effect?
              this.io.emit("visual_effect", {
                type: "hit",
                x: other.x,
                y: other.y,
                color: "#ffd700"
              });
            }
          }
        }

        // FRICTION LOGIC (Techno Mines)

        // FRICTION LOGIC (Techno Mines)
        if (p.friction) {
          p.vx *= 0.95; // Slow down
          p.vy *= 0.95;
          // Stop completely if slow enough
          if (Math.abs(p.vx) < 10 && Math.abs(p.vy) < 10) {
            p.vx = 0;
            p.vy = 0;
          }
        }

        // Basic Bounds/Lifespan check
        if (p.life <= 0 || p.x < 0 || p.x > 1600 || p.y < 0 || p.y > 1200) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // Collision with Map Obstacles (Walls)
        let hitWall = false;
        const pRect = { x: p.x - 5, y: p.y - 5, w: 10, h: 10 }; // Approx projectile size

        // SNIPER: Penetrate Walls
        // LAVA WAVE: Also penetrates walls? Maybe not obstacles, just enemies? "Vague de lave" usually flows.
        // Let's say Lava Wave blocked by walls for now unless requested.

        if (!p.penetrateWalls) {
          // RESOLVE MAP CONTEXT
          // Use the obstacles attached to the projectile (robust) OR default to Arena
          let obstacles = p.obstacles || MapData.obstacles;

          // Fallback: If absolutely no obstacles found, maybe Owner lookup?
          // But p.obstacles should handle it.
          // Force BR obstacles if position is clearly outside Arena > 1800
          // (Safety for projectiles spawned before update or edge cases)
          if (!p.obstacles && (p.x > 1800 || p.y > 1400)) {
            // We need MapDataBR reference. We don't have it imported at top?
            // Assuming owner check as last resort
            const owner = this.players.get(p.ownerId);
            if (owner && owner.currentMapObstacles) {
              obstacles = owner.currentMapObstacles;
            }
          }

          // TECHNO MINE: Sticky Walls?
          // If friction is true (Mine), and hits wall -> Stick (Stop)
          if (p.friction) {
            for (const obs of obstacles) {
              if (
                pRect.x < obs.x + obs.w &&
                pRect.x + pRect.w > obs.x &&
                pRect.y < obs.y + obs.h &&
                pRect.y + pRect.h > obs.y
              ) {
                // LOGICAL BOUNCE (AABB Reflection)
                const pRadius = 5;
                const ox = (obs.w / 2 + pRadius) - Math.abs((pRect.x + 5) - (obs.x + obs.w / 2));
                const oy = (obs.h / 2 + pRadius) - Math.abs((pRect.y + 5) - (obs.y + obs.h / 2));

                if (ox < oy) {
                   p.vx = -p.vx * 0.7; // Bounce X
                   p.x += (pRect.x + 5 < obs.x + obs.w / 2) ? -ox : ox;
                } else {
                   p.vy = -p.vy * 0.7; // Bounce Y
                   p.y += (pRect.y + 5 < obs.y + obs.h / 2) ? -oy : oy;
                }

                hitWall = false; // Don't destroy
                break;
              }
            }
          } else {
            // Normal Bullet / Lava
            for (const obs of obstacles) {
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
          }
        }

        if (hitWall) {
          this.projectiles.splice(i, 1);
          continue;
        }

        // ENGINEER: Wall Reflection
        // Check dynamic walls (WALL_TEMP)
        for (const ent of this.entities) {
          if (ent.type === "WALL_TEMP") {
            // AABB Check
            if (
              pRect.x < ent.x + ent.w &&
              pRect.x + pRect.w > ent.x &&
              pRect.y < ent.y + ent.h &&
              pRect.y + pRect.h > ent.y
            ) {
              // Collision with Force Field
              if (p.ownerId === ent.ownerId) {
                // Pass through (Owner-only)
              } else {
                // Reflect Bullet
                // Simple Box Bounce: Determine side
                const dx = p.x - (ent.x + ent.w / 2);
                const dy = p.y - (ent.y + ent.h / 2);
                const width = (pRect.w + ent.w) / 2;
                const height = (pRect.h + ent.h) / 2;
                const crossWidth = width * dy;
                const crossHeight = height * dx;

                if (Math.abs(dx) <= width && Math.abs(dy) <= height) {
                  if (crossWidth > crossHeight) {
                    if (crossWidth > -crossHeight) {
                      p.vy = Math.abs(p.vy); // Bottom hit -> Down
                    } else {
                      p.vx = -Math.abs(p.vx); // Left hit -> Left
                    }
                  } else {
                    if (crossWidth > -crossHeight) {
                      p.vx = Math.abs(p.vx); // Right hit -> Right
                    } else {
                      p.vy = -Math.abs(p.vy); // Top hit -> Up
                    }
                  }

                  // Steal Bullet
                  p.ownerId = ent.ownerId;
                  p.color = "#00f3ff"; // Turn into Engineer Bullet Color

                  // Buff Damage on Reflection (User Request)
                  if (p.damage) p.damage *= 2;
                  else p.damage = 30; // Default 15 * 2

                  // Push out slightly
                  p.x += p.vx * 0.05;
                  p.y += p.vy * 0.05;
                }
              }
            }
          }
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

            // CORE SCALING (Arena Support if applicable)
            const attacker = this.players.get(p.ownerId);
            if (attacker) {
              // +9 Damage per Core (User Request)
              damage += (attacker.powerCores || 0) * 9;
            }

            // MARKER DAMAGE AMPLIFICATION
            if (player.isMarked) {
              damage *= 1.5;
            }

            // APPLY MARK
            if (p.effect === "MARK") {
              player.isMarked = true;
              // Refresh mark timer
              if (player.markTimeout) clearTimeout(player.markTimeout);
              player.markTimeout = setTimeout(() => {
                player.isMarked = false;
              }, 5000); // 5 Seconds Mark
            }

            // HIT EFFECT
            this.io.emit("visual_effect", {
              type: "hit",
              targetId: id,
              x: player.x,
              y: player.y,
              color: p.color || "#fff",
            });

            // MAGMA SCALING
            if (p.type === "LAVA_WAVE" && p.maxLife) {
              const ratio = Math.max(0, p.life / p.maxLife);
              const distFactor = 1.0 - ratio;
              damage = damage * (1 + distFactor * 0.5);
            }

            // BOOMERANG LOGIC (Aegis)
            if (p.type === "BOOMERANG") {
              // Init Hit List
              if (!p.hitTargets) p.hitTargets = [];

              // Check if already hit this pass
              if (p.hitTargets.includes(id)) {
                // Already hit this player, ignore damage
                continue;
              }

              // Register Hit
              p.hitTargets.push(id);

              // Apply SLOW (80% Slow for 2s? Or less?)
              // User said "rallenti". Let's do 50% slow.
              player.speed = player.baseSpeed * 0.5;
              player.isSlowed = true; // Use existing flag if any
              if (player.slowTimeout) clearTimeout(player.slowTimeout);
              player.slowTimeout = setTimeout(() => {
                player.speed = player.baseSpeed;
                player.isSlowed = false;
              }, 2000);

              // Apply Damage
              player.hp -= damage;

              // Check Death
              if (player.hp <= 0) this.handlePlayerDeath(player, p.ownerId);

              // DO NOT SPLICE (Penetrate)
              // DO NOT BREAK (Continue checking other players if overlapped)
              continue;
            }

            // FREEZE EFFECT
            if (p.effect === "FREEZE") {
              player.isFrozen = true;
              player.speed = 0;
              player.freezeEndTime = Date.now() + 2000;
              setTimeout(() => {
                player.isFrozen = false;
                player.speed = player.baseSpeed;
                player.freezeEndTime = 0;
              }, 2000);
            }

            // POISON EFFECT (VIPER)
            if (p.isPoison) {
              damage += 25;
              player.speed = player.baseSpeed * 0.4;
              player.isPoisoned = true;

              if (player.poisonTimeout) clearTimeout(player.poisonTimeout);

              player.poisonTimeout = setTimeout(() => {
                player.speed = player.baseSpeed;
                player.isPoisoned = false;
                player.poisonTimeout = null;
              }, 3000);

              this.io.emit("visual_effect", {
                type: "poison_hit",
                targetId: player.id,
                x: player.x,
                y: player.y,
              });
            }

            player.takeDamage(damage);
            this.projectiles.splice(i, 1);

            // Handle Death
            if (player.hp <= 0) {
              this.handlePlayerDeath(player, p.ownerId);
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
            player.takeDamage(40); // Big damage
            this.entities.splice(i, 1);

            if (player.hp <= 0) {
              const killer = this.players.get(ent.ownerId);
              if (killer) {
                this.awardCoins(killer.username, 50);
                // NOTIFY KILLER (Mine)
                this.io.to(ent.ownerId).emit("kill_confirmed", {
                  victim: player.username || player.hero.name,
                });
              }
              // TRIGGER DEATH
              const deathX = player.x;
              const deathY = player.y;
              player.hp = 0;
              player.isDead = true;
              const kName = killer ? killer.username || "Unknown" : "Unknown";
              const hName =
                killer && killer.hero ? killer.hero.name || killer.hero : "?";
              player.killedBy = kName;
              player.killedByHero = typeof hName === "string" ? hName : "?";
              player.isFrozen = false; // Clear Frost
              player.freezeEndTime = 0;
              player.respawnTime = Date.now() + 5000;
              // Teleport to safe zone immediately (Invisible)
              const spawn = this.getSafeSpawn();
              player.x = spawn.x;
              player.y = spawn.y;

              // Explosion Event
              this.io.to("game_room").emit("player_died", {
                x: deathX,
                y: deathY,
                color: player.color,
              });
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
