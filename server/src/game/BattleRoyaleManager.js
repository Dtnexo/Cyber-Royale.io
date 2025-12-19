const MapDataBR = require("./MapDataBR");
const { User } = require("../models");

class BattleRoyaleManager {
  constructor(io, gameServer) {
    this.io = io;
    this.gameServer = gameServer;
    this.queue = [];
    this.players = new Map(); // Map<socketId, PlayerInstance>
    this.projectiles = [];
    this.entities = []; // Mines, etc.
    this.state = "waiting"; // waiting, countdown, active, ended
    this.zone = { x: 2000, y: 2000, radius: 3000 };
    this.crates = [];
    this.items = []; // Dropped Cores {x, y, value, id}
    this.MAX_PLAYERS = 14;
    this.MIN_PLAYERS_TO_START = 2; // Testing
    this.QUEUE_TIMEOUT = 60000;
    this.queueTimer = null;
    this.startTime = 0;
  }

  joinQueue(socket, playerData) {
    if (this.state !== "waiting") {
      socket.emit("error_message", "Match in progress.");
      return;
    }
    // Check dupe socket
    if (this.queue.find((q) => q.socket.id === socket.id)) return;

    // UNIQUE USERNAME ENFORCEMENT (Strict Single Session)
    // If user acts again, remove previous entry (handle refresh)
    const username = playerData.username || "Guest";
    const existingIdx = this.queue.findIndex(
      (q) => q.playerData.username === username
    );

    if (existingIdx !== -1) {
      // Notify and Remove old
      const oldSocket = this.queue[existingIdx].socket;
      oldSocket.emit(
        "error_message",
        "New session started. Removed from queue."
      );
      this.queue.splice(existingIdx, 1);
    }

    // No renaming, just use the name
    playerData.username = username;

    this.queue.push({ socket, playerData });
    socket.join("br_lobby");

    this.io.to("br_lobby").emit("queue_update", {
      count: this.queue.length,
      max: this.MAX_PLAYERS,
      players: this.queue.map((q) => q.playerData.username),
    });

    if (this.queue.length === this.MIN_PLAYERS_TO_START) this.startQueueTimer();
    if (this.queue.length >= this.MAX_PLAYERS) this.startCountdown();
  }

  leaveQueue(socket) {
    const idx = this.queue.findIndex((q) => q.socket.id === socket.id);
    if (idx !== -1) {
      const username = this.queue[idx].playerData.username;
      this.queue.splice(idx, 1);

      this.io.to("br_lobby").emit("queue_notification", {
        type: "leave",
        message: `${username} ABORTED DEPLOYMENT`,
      });

      this.io.to("br_lobby").emit("queue_update", {
        count: this.queue.length,
        max: this.MAX_PLAYERS,
        players: this.queue.map((q) => q.playerData.username),
      });

      // Reset timer if we drop below min players
      if (this.queue.length < this.MIN_PLAYERS_TO_START && this.queueTimer) {
        clearInterval(this.queueTimer);
        this.queueTimer = null;
        this.io.to("br_lobby").emit("queue_status", "Waiting for players...");
        this.io.to("br_lobby").emit("queue_timer", 0); // Hide timer
      }
    }
  }

  handleDisconnect(socket) {
    // 1. Remove from Queue if there
    this.leaveQueue(socket);

    // 2. Kill/Remove if in Match
    if (this.state === "active" || this.state === "countdown") {
      const p = this.players.get(socket.id);
      if (p && p.alive) {
        console.log(`[BR] Player ${p.username} disconnected.`);
        this.killPlayer(p, null); // Kill them to drop loot
        // We do NOT remove from map immediately so stats/spectating works for a bit?
        // But honestly, if they disconnect, they are gone.
        // killPlayer sets alive=false.
      }
      // If state is countdown, we might want to just remove them completely?
      // But startMatch uses this.players.
      if (this.state === "countdown") {
        this.players.delete(socket.id);
      }
    }
  }

  startQueueTimer() {
    clearTimeout(this.queueTimer);
    let timeLeft = 30; // 30s wait

    this.queueTimer = setInterval(() => {
      // Abort if players left
      if (this.queue.length < this.MIN_PLAYERS_TO_START) {
        clearInterval(this.queueTimer);
        this.queueTimer = null;
        this.io.to("br_lobby").emit("queue_status", "Waiting for players...");
        return;
      }

      timeLeft--;
      // Always broadcast timer (since we are above min players)
      this.io.to("br_lobby").emit("queue_timer", timeLeft);

      if (timeLeft <= 0) {
        clearInterval(this.queueTimer);
        if (this.queue.length >= this.MIN_PLAYERS_TO_START) {
          this.startCountdown();
        } else {
          this.io
            .to("br_lobby")
            .emit("queue_status", "Not enough players, retrying...");
          this.startQueueTimer(); // Reset
        }
      }
    }, 1000);
  }

  startCountdown() {
    clearInterval(this.queueTimer);
    this.state = "countdown";
    let count = 3;

    this.players.clear();

    // HOT RELOAD MAP DATA
    // We clear the cache so edits to MapDataBR.js apply immediately without server restart.
    try {
      const mapPath = require.resolve("./MapDataBR");
      delete require.cache[mapPath];
    } catch (e) {
      console.log("Could not clear map cache", e);
    }
    const MapData = require("./MapDataBR");

    this.crates = JSON.parse(JSON.stringify(MapData.crates));
    this.items = [];
    this.projectiles = [];
    this.entities = [];
    this.zone = { x: 2000, y: 2000, radius: 3200 }; // Starts slightly larger
    this.matchTime = 0;

    // Shuffle Spawns
    const spawns = [...MapData.spawns].sort(() => Math.random() - 0.5);

    const Player = require("./Player");
    this.queue.forEach(({ socket, playerData }, index) => {
      const p = new Player(
        socket.id,
        playerData.hero,
        playerData.username,
        playerData.skinColor
      );

      // Assign Spawn
      if (index < spawns.length) {
        p.x = spawns[index].x;
        p.y = spawns[index].y;
      } else {
        // Fallback random if more players than spawns (unlikely with 14 cap)
        p.x = 200 + Math.random() * 3600;
        p.y = 200 + Math.random() * 3600;
      }

      p.alive = true;
      const MapDataBR = require("./MapDataBR");

      this.players.set(socket.id, p);

      // Inject Map Context
      p.mapLimits = { width: MapDataBR.width, height: MapDataBR.height };
      p.currentMapObstacles = MapDataBR.obstacles;

      socket.emit("br_start", {
        map: MapDataBR,
        zone: this.zone,
        playerId: socket.id,
        pos: { x: p.x, y: p.y },
        color: p.color,
        hp: p.hp,
        maxHp: p.maxHp,
        heroClass: p.heroClass,
      });
    });
    this.queue = [];

    const intv = setInterval(() => {
      this.io.to("br_lobby").emit("br_countdown", count);
      count--;
      if (count < 0) {
        clearInterval(intv);
        this.startMatch();
      }
    }, 1000);
  }

  startMatch() {
    this.state = "active";
    this.matchTime = 0;
    this.io.to("br_lobby").emit("br_countdown", 0); // GO!
    console.log("[BR] Active!");
  }

  handleInput(socketId, inputData) {
    if (this.state !== "active") return;
    const p = this.players.get(socketId);
    if (p && p.alive) {
      p.keys = inputData.keys;
      p.mouseAngle = inputData.mouseAngle;
    }
  }

  handleSkill(socketId) {
    if (this.state !== "active") return;
    const p = this.players.get(socketId);
    if (p && p.alive) {
      const result = p.useSkill();
      if (result) {
        const results = Array.isArray(result) ? result : [result];

        // POWER CORE SCALING (User Request: "les cores augmente les dégats des pouvoirs")
        const multiplier = 1 + (p.powerCores || 0) * 0.1; // 10% per Core

        results.forEach((item) => {
          if (item.damage) {
            item.damage = Math.floor(item.damage * multiplier);
          }
          this.addEntityOrProjectile(item);
        });
      }
    }
  }

  addEntityOrProjectile(item) {
    if (
      item.type === "PROJECTILE" ||
      item.type === "LAVA_WAVE" ||
      item.type === "MINE_PROJ" ||
      item.type === "SNIPER_SHOT"
    ) {
      this.projectiles.push(item);
    } else if (item.type === "SHOCKWAVE") {
      // NOVA: Immediate AoE Effect
      this.io.to("br_lobby").emit("visual_effect", {
        type: "shockwave",
        x: item.x,
        y: item.y,
        radius: item.radius,
        color: item.color,
      });

      // Apply Physics/Damage to other players
      for (const [pid, p] of this.players) {
        if (pid === item.ownerId) continue;
        if (p.alive === false) continue;

        const dx = p.x - item.x;
        const dy = p.y - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < item.radius) {
          // Knockback
          // Knockback Physics (Step Check)
          const angle = Math.atan2(dy, dx);
          const force = item.knockback;
          const steps = 10;
          let finalX = p.x;
          let finalY = p.y;

          // BR MODE: Use Global Map Obstacles
          const obstacles = MapDataBR.obstacles || [];

          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const tx = p.x + Math.cos(angle) * force * t;
            const ty = p.y + Math.sin(angle) * force * t;

            // Check Collision for this step
            const pRect = { x: tx - 20, y: ty - 20, w: 40, h: 40 };
            let hit = false;

            for (const obs of obstacles) {
              if (
                pRect.x < obs.x + obs.w &&
                pRect.x + pRect.w > obs.x &&
                pRect.y < obs.y + obs.h &&
                pRect.y + pRect.h > obs.y
              ) {
                hit = true;
                break;
              }
            }

            if (hit) break; // Stop at previous step (Block at wall face)
            finalX = tx;
            finalY = ty;
          }

          // Clamp to Map
          finalX = Math.max(0, Math.min(MapDataBR.width, finalX));
          finalY = Math.max(0, Math.min(MapDataBR.height, finalY));

          p.x = finalX;
          p.y = finalY;

          // Damage
          p.hp -= item.damage;
          // BR Death is handled in update loop
        }
      }
    } else if (item.type === "SUPERNOVA_CHARGE") {
      // NOVA: Mark start time on player for delayed explosion
      const p = this.players.get(item.ownerId);
      if (p) {
        p.supernovaStartTime = Date.now();
        // Visual Charge
        this.io.to("br_lobby").emit("visual_effect", {
          type: "supernova_cast",
          x: item.x,
          y: item.y,
        });
      }
    } else {
      this.entities.push(item);
      if (item.life) {
        setTimeout(() => {
          const idx = this.entities.indexOf(item);
          if (idx > -1) this.entities.splice(idx, 1);
        }, item.life);
      }
    }
  }

  update(dt) {
    if (this.state !== "active") return;

    this.matchTime += dt;

    // ZONE (Delayed 30s)
    if (this.matchTime > 30) {
      if (this.zone.radius > 200) {
        this.zone.radius -= 20 * dt; // Slow shrink
      }
    }

    // UPDATE PLAYERS & SUPERNOVA
    this.players.forEach((p) => {
      if (!p.alive) return;

      // SUPERNOVA LOGIC
      if (p.supernovaStartTime) {
        if (Date.now() - p.supernovaStartTime >= 800) {
          // Slight delay sync with animation (was 500, new animation is ~1s, lets trigger blast at 0.8s)

          this.io.to("br_lobby").emit("visual_effect", {
            type: "supernova_blast",
            x: p.x,
            y: p.y,
          });

          // Damage
          const multiplier = 1 + (p.powerCores || 0) * 0.1;
          const damage = 60 * multiplier;

          this.addEntityOrProjectile({
            type: "SHOCKWAVE",
            x: p.x,
            y: p.y,
            ownerId: p.id,
            radius: 350,
            damage: damage,
            knockback: 400,
            color: "#da70d6",
          });

          delete p.supernovaStartTime;
        }
      }

      // STORM HERO LOGIC (Tesla Coil)
      if (p.stormActive) {
        if (!p.lastStormZap) p.lastStormZap = 0;
        const now = Date.now();
        if (now - p.lastStormZap >= 100) {
          // Fast Tick (0.1s)
          p.lastStormZap = now;

          // Find ALL enemies in range
          const targets = [];
          const range = 300;

          for (const [tid, target] of this.players) {
            if (tid === p.id || !target.alive) continue;

            const dist = Math.hypot(target.x - p.x, target.y - p.y);
            if (dist < range) {
              targets.push(target);
            }
          }

          // CHAOTIC STORM: Chance to zap each target independently
          if (targets.length > 0) {
            for (const target of targets) {
              // 35% chance per 0.1s ~ 3.5 hits/sec
              if (Math.random() < 0.35) {
                const multiplier = 1 + (p.powerCores || 0) * 0.1;
                const damage = 35 * multiplier;
                target.takeDamage(damage);

                // Visual
                this.io.to("br_lobby").emit("visual_effect", {
                  type: "lightning_zap",
                  x1: p.x,
                  y1: p.y,
                  x2: target.x,
                  y2: target.y,
                  color: "#00F3FF",
                });

                if (target.hp <= 0 && target.alive) {
                  this.killPlayer(target, p.id);
                }
              }
            }
      }
    });

    // SPAWN TRAILS FOR VOLT PLAYERS
    this.players.forEach((p) => {
        if (p.alive && p.staticFieldActive) {
            const lx = p.lastTrailX || p.x;
            const ly = p.lastTrailY || p.y;
            const dist = Math.hypot(p.x - lx, p.y - ly);

            if (dist > 10) {
                this.entities.push({
                    type: "TRAIL_SEGMENT",
                    x: p.x,
                    y: p.y,
                    ownerId: p.id,
                    life: 3000,
                    damage: 3,
                    radius: 15,
                    color: "#00f3ff"
                });
                p.lastTrailX = p.x;
                p.lastTrailY = p.y;
            }
        }
    });

    const statePack = {
      players: [],
      projectiles: this.projectiles,
      entities: this.entities,
      items: this.items,
      crates: this.crates,
      zone: this.zone,
      aliveCount: 0,
    };

    // PLAYERS
    this.players.forEach((p) => {
      // Send Dead Players only if they just died or are spectating?
      // Actually we send all players generally, client filters visuals.

      if (!p.alive && !p.spectating) {
        // Optimization: Could stop sending very old dead players
      }

      if (p.alive) {
        p.update(dt, true); // Enable Sprint for BR

        // Zone Damage
        const dx = p.x - this.zone.x;
        const dy = p.y - this.zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > this.zone.radius) {
          p.takeDamage(50 * dt); // Zone Logic
        }

        // Shoot
        if (p.keys.space) {
          const proj = p.shoot();
          if (proj) {
            // POWER CORE SCALING (Primary Fire & Weapon Buffs like Techno/Blaze)
            const multiplier = 1 + (p.powerCores || 0) * 0.1;
            if (proj.damage) proj.damage = Math.floor(proj.damage * multiplier);
            this.addEntityOrProjectile(proj);
          }
        }

        // Death Check (Zone or DoT)
        if (p.hp <= 0) {
          this.killPlayer(p, null);
        }

        // Item Pickup
        for (let i = this.items.length - 1; i >= 0; i--) {
          const item = this.items[i];
          const idx = p.x - item.x;
          const idy = p.y - item.y;
          if (Math.sqrt(idx * idx + idy * idy) < 40) {
            p.addCore(); // +Stats
            this.items.splice(i, 1);
          }
        }
      }

      statePack.players.push({
        id: p.id,
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        stamina: p.stamina,
        maxStamina: p.maxStamina,
        isSprinting: p.keys.shift && p.stamina > 0,
        hero: p.hero.name,
        heroClass: p.hero.class,
        angle: p.mouseAngle,
        isDead: !p.alive,
        powerCores: p.powerCores || 0,
        username: p.username,
        color: p.color,
        shield: p.shieldActive,
        invisible: p.isInvisible,
        isFrozen: p.isFrozen,
        isPoisoned: p.isPoisoned,
        isSkillActive: p.isSkillActive,
        skillCD: p.cooldowns.skill,
        shootCD: p.cooldowns.shoot, // Exposure for UI/Visuals
        maxSkillCD: p.hero.stats.cooldown,
        teleportMarker: p.teleportMarker
          ? { x: p.teleportMarker.x, y: p.teleportMarker.y }
          : null,
      });

      // Debug log for Ghost marker
      if (p.hero.name === "Ghost" && p.teleportMarker) {
        console.log("[SERVER] Sending marker to client:", p.teleportMarker);
      }
    });

    // Calc Alive
    let alive = 0;
    this.players.forEach((p) => {
      if (p.alive) alive++;
    });
    statePack.aliveCount = alive;

    // PROJECTILES
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];

      // FRICTION (Mines)
      if (proj.friction) {
        proj.vx *= 0.9; // Rapid deceleration
        proj.vy *= 0.9;
      }

      const prevX = proj.x;
      const prevY = proj.y; // Store previous position for Raycast
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt * 1000;

      if (proj.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // WALL COLLISION
      // Optimization: Require at top if possible, but for hot-reload safety we keep it here or move it.
      // Let's rely on global or cached.
      let wallHit = false;
      const obstacles = require("./MapDataBR").obstacles;

      const pRect = { x: proj.x, y: proj.y, w: 10, h: 10 }; // Approx

      if (!proj.penetrateWalls) {
        for (const obs of obstacles) {
          // STANDARD AABB
          if (
            proj.x < obs.x + obs.w &&
            proj.x + 10 > obs.x &&
            proj.y < obs.y + obs.h &&
            proj.y + 10 > obs.y
          ) {
            if (proj.friction) {
              // TECHNO MINE BOUNCE (AABB Reflection)
              const pRadius = 5;
              const ox =
                obs.w / 2 +
                pRadius -
                Math.abs(proj.x + 5 - (obs.x + obs.w / 2));
              const oy =
                obs.h / 2 +
                pRadius -
                Math.abs(proj.y + 5 - (obs.y + obs.h / 2));

              if (ox < oy) {
                proj.vx = -proj.vx * 0.7; // Bounce X
                proj.x += proj.x < obs.x + obs.w / 2 ? -ox : ox;
              } else {
                proj.vy = -proj.vy * 0.7; // Bounce Y
                proj.y += proj.y < obs.y + obs.h / 2 ? -oy : oy;
              }
              // Don't destroy
              break;
            } else {
              wallHit = true;
              break;
            }
          }
        }
      } // End penetrate check

      if (wallHit) {
        this.projectiles.splice(i, 1);
        continue;
      }

      let hit = false;
      // CRATE COLLISION
      for (let c = this.crates.length - 1; c >= 0; c--) {
        const crate = this.crates[c];
        if (
          crate.active &&
          proj.x > crate.x &&
          proj.x < crate.x + crate.w &&
          proj.y > crate.y &&
          proj.y < crate.y + crate.h
        ) {
          crate.hp -= proj.damage || 20;
          hit = true;

          if (crate.hp <= 0) {
            crate.active = false; // "Destroyed" visually
            // Drop Core
            this.spawnItem(crate.x + 30, crate.y + 30);
            this.crates.splice(c, 1); // Remove for now or mark dead
          }
          break;
        }
      }

      if (hit) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // ENTITY COLLISION (Engineer Walls - BOUNCE)
      let entityHit = false;
      for (const ent of this.entities) {
        if (ent.type === "WALL_TEMP") {
          // Check AABB Collision primarily
          if (
            proj.x > ent.x &&
            proj.x < ent.x + ent.w &&
            proj.y > ent.y &&
            proj.y < ent.y + ent.h
          ) {
            // Check Ownership (Pass through own wall)
            if (ent.ownerId === proj.ownerId) continue;

            // BOUNCE LOGIC (Restored Vector Reflection for Rotated Walls)
            // Reflect velocity based on Wall Angle
            const normalAngle = ent.angle + Math.PI / 2;
            const nx = Math.cos(normalAngle);
            const ny = Math.sin(normalAngle);

            // Dot Product: v . n
            const dot = proj.vx * nx + proj.vy * ny;

            // Reflection: v = v - 2 * (v . n) * n
            proj.vx = proj.vx - 2 * dot * nx;
            proj.vy = proj.vy - 2 * dot * ny;

            // Push out slightly to prevent sticking
            proj.x += proj.vx * dt * 2;
            proj.y += proj.vy * dt * 2;

            entityHit = true; // Bounced, but keeps living
            break; // Handle one bounce per frame to avoid chaos
          }
        }
      }
      if (entityHit) continue; // Skip player collision this frame if we hit a wall

      // PLAYER COLLISION (Raycast for Anti-Tunneling)
      for (const [pid, target] of this.players) {
        if (pid === proj.ownerId || !target.alive) continue;

        // PIERCING LOGIC: Check if already hit
        if (proj.pierceEnemies && proj.hitList && proj.hitList.includes(pid)) {
          continue; // Already hit this player
        }

        // RAYCAST CHECK
        // Segment: (prevX, prevY) -> (proj.x, proj.y)
        // Circle: (target.x, target.y) Radius 35
        const ax = prevX !== undefined ? prevX : proj.x;
        const ay = prevY !== undefined ? prevY : proj.y;
        const bx = proj.x;
        const by = proj.y;
        const cx = target.x;
        const cy = target.y;
        const r = 35; // Hitbox

        const labX = bx - ax;
        const labY = by - ay;
        const lacX = cx - ax;
        const lacY = cy - ay;

        const lenSq = labX * labX + labY * labY;
        let t = 0;
        if (lenSq > 0) {
          t = (lacX * labX + lacY * labY) / lenSq;
          t = Math.max(0, Math.min(1, t));
        }
        const closetX = ax + t * labX;
        const closetY = ay + t * labY;

        const distSq = (cx - closetX) ** 2 + (cy - closetY) ** 2;

        if (distSq < r * r) {
          // CALC DAMAGE (Scaled by Attacker Cores)
          const attacker = this.players.get(proj.ownerId);
          let dmg = proj.damage || 15;

          if (attacker) {
            // +9 Damage per Core (User Request)
            dmg += (attacker.powerCores || 0) * 9;
          }

          // VIPER POISON LOGIC
          if (proj.isPoison) {
            dmg += 25; // Bonus Damage
            target.speed = target.baseSpeed * 0.4; // 60% Slow
            target.isPoisoned = true;

            if (target.poisonTimeout) clearTimeout(target.poisonTimeout);
            target.poisonTimeout = setTimeout(() => {
              target.speed = target.baseSpeed;
              target.isPoisoned = false;
              target.poisonTimeout = null;
            }, 3000);

            this.io.to("br_lobby").emit("visual_effect", {
              type: "poison_hit",
              targetId: target.id,
              x: target.x,
              y: target.y,
            });
          }

          target.takeDamage(dmg);

          // EMIT VISUAL HIT (Triggers FlashTime on Client)
          this.io.to("br_lobby").emit("visual_effect", {
            type: "hit",
            x: proj.x,
            y: proj.y,
            color: "#ff0000",
            targetId: target.id, // Only this target flashes
          });

          // Destroy projectile unless piercing
          if (proj.pierceEnemies) {
            if (!proj.hitList) proj.hitList = [];
            proj.hitList.push(pid);
          } else {
            this.projectiles.splice(i, 1);
          }

          if (target.hp <= 0) this.killPlayer(target, proj.ownerId);
          if (!proj.pierceEnemies) break; // Stop checking players if not piercing
        }
      }
    }

    // ENTITIES (Volt Trails, etc.)
    for (let i = this.entities.length - 1; i >= 0; i--) {
        const ent = this.entities[i];
        if (ent.type === "TRAIL_SEGMENT") {
            ent.life -= 30;
            if (ent.life <= 0) {
                this.entities.splice(i, 1);
                continue;
            }

            // Damage Players
            for (const [pid, target] of this.players) {
                if (pid === ent.ownerId) continue;
                if (!target.alive || target.invisible || target.isPhasing) continue;

                const dist = Math.hypot(target.x - ent.x, target.y - ent.y);
                if (dist < 25) {
                    target.takeDamage(3, ent.ownerId); // Nerfed Damage (3)
                    if (target.hp <= 0 && target.alive) {
                        this.killPlayer(target, ent.ownerId);
                    }
                }
            }
        }
    }

    // SPAWN TRAILS FOR VOLT PLAYERS
    this.players.forEach((p) => {
        if (p.alive && p.staticFieldActive) {
            const lx = p.lastTrailX || p.x;
            const ly = p.lastTrailY || p.y;
            const dist = Math.hypot(p.x - lx, p.y - ly);

            if (dist > 10) {
                this.entities.push({
                    type: "TRAIL_SEGMENT",
                    x: p.x,
                    y: p.y,
                    ownerId: p.id,
                    life: 3000,
                    damage: 3,
                    radius: 15,
                    color: "#00f3ff"
                });
                p.lastTrailX = p.x;
                p.lastTrailY = p.y;
            }
        }
    });

    // BROADCAST
    this.io.to("br_lobby").emit("br_update", statePack);

    // Check Win
    if (alive <= 1 && this.players.size > 1) {
      this.endMatch();
    }
  }

  killPlayer(victim, killerId) {
    victim.alive = false;
    victim.hp = 0;

    // Notify Victim of Rank
    let rank = 0;
    this.players.forEach((p) => {
      if (p.alive) rank++;
    });
    rank += 1; // I am the next one out

    const victimSocket = this.io.sockets.sockets.get(victim.id);
    if (victimSocket) {
      let killerName = "Unknown";
      let killerHero = "Unknown";
      if (killerId) {
        const k = this.players.get(killerId);
        if (k) {
          killerName = k.username;
          try {
            // k.hero is object with name property in some contexts, but string in others?
            // In Manager constructor, hero is stored as object if passed?
            // Let's assume k.hero is normalized or check structure.
            // Actually in BR Manager addPlayer: p.hero = {name: ..., ...} NO,
            // line 59: this.players.set(socket.id, new Player(...))
            // Player.js: this.hero = heroData; (Object)
            // So k.hero.name is correct.
            killerHero = k.hero.name || k.hero;
          } catch (e) {
            killerHero = "Unknown";
          }
        }
      }
      victimSocket.emit("br_eliminated", {
        rank,
        total: this.players.size,
        killedBy: killerName,
        killedByHero: killerHero,
        killerId: killerId, // Send ID for spectating
      });

      // AWARD COINS (Immediate Feedback)
      const earned = (this.MAX_PLAYERS - rank) * 10 + (victim.kills || 0) * 50;
      if (earned > 0) {
        if (victimSocket) victimSocket.emit("br_rewards", { coins: earned });
      }

      // SAVE TO DB
      if (victim.username && victim.username !== "Guest" && earned > 0) {
        User.findOne({ where: { username: victim.username } })
          .then((u) => {
            if (u) {
              u.coins += earned;
              u.save();
              console.log(`[BR] Saved ${earned} coins for ${u.username}`);
            }
          })
          .catch((e) => console.error("Coin Save Error:", e));
      }
    }

    // Drop Cores
    const coresToDrop = Math.max(1, Math.floor(victim.powerCores / 2));
    for (let i = 0; i < coresToDrop; i++) {
      this.spawnItem(
        victim.x + (Math.random() * 80 - 40), // Increased spread slightly
        victim.y + (Math.random() * 80 - 40)
      );
    }

    if (killerId) {
      const killer = this.players.get(killerId);
      if (killer) {
        killer.kills = (killer.kills || 0) + 1;
        // Heal killer?
        killer.hp = Math.min(killer.maxHp, killer.hp + 200);
      }
    }
  }

  spawnItem(x, y) {
    // Clamp to Safe Map Area (Walls are 50px thick, map is 4000x4000)
    // Safe zone approx 60 to 3940
    const safeX = Math.max(70, Math.min(3930, x));
    const safeY = Math.max(70, Math.min(3930, y));
    this.items.push({ x: safeX, y: safeY });
  }

  forceRemovePlayer(username) {
    // 1. Queue
    const qIdx = this.queue.findIndex(
      (q) => q.playerData.username === username
    );
    if (qIdx !== -1) {
      const s = this.queue[qIdx].socket;
      s.emit("error_message", "New session started.");
      s.disconnect(true);
      this.queue.splice(qIdx, 1);
      this.io.to("br_lobby").emit("queue_update", {
        count: this.queue.length,
        max: this.MAX_PLAYERS,
      });
    }

    // 2. Active Match
    if (this.state === "active" || this.state === "countdown") {
      for (const [pid, p] of this.players) {
        if (p.username === username) {
          // Found them.
          const s = this.io.sockets.sockets.get(pid);
          if (s) s.disconnect(true);

          if (this.state === "countdown") {
            this.players.delete(pid);
          } else {
            this.killPlayer(p, null);
            // Trigger update check next loop
          }
        }
      }
    }
  }

  endMatch() {
    this.state = "ended";
    let winner = null;
    let aliveCount = 0;
    this.players.forEach((p) => {
      if (p.alive) {
        winner = p;
        aliveCount++;
      }
    });

    const winnerName = winner ? winner.username : "No One";

    // WINNER REWARDS
    let earned = 0;
    if (winner) {
      earned = 500 + (winner.kills || 0) * 50;
      // Save DB
      if (winner.username && winner.username !== "Guest") {
        User.findOne({ where: { username: winner.username } })
          .then((u) => {
            if (u) {
              u.coins += earned;
              u.brWins = (u.brWins || 0) + 1; // Increment Wins
              u.save();
              console.log(
                `[BR_WIN] Saved ${earned} coins & Win for Winner ${u.username}`
              );
            }
          })
          .catch((e) => console.error("Win Save Error:", e));
      }
    }

    this.io.to("br_lobby").emit("br_game_over", {
      winner: winnerName,
      coinsEarned: earned,
    });

    console.log("[BR] Winner:", winnerName);

    // If 0 players alive (Everyone left), reset QUICKLY
    const resetTime = aliveCount === 0 ? 1000 : 10000;

    setTimeout(() => {
      this.players.clear();
      this.state = "waiting";
      this.io.to("br_lobby").emit("queue_status", "Waiting for players...");
      // Also reset queue timer/countdown just in case
      this.io.to("br_lobby").emit("br_countdown", -1);
    }, resetTime);
  }
}

module.exports = BattleRoyaleManager;
