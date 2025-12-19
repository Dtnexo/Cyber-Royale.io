class Player {
  constructor(id, heroData, username, customColor) {
    this.id = id;
    this.hero = heroData; // { id, name, stats: { hp, speed, cooldown } }
    this.heroName = heroData.name;
    this.heroClass = heroData.class;
    this.username = username || "Unknown"; // Store username
    this.x = 400; // Center
    this.y = 300;
    this.hp = heroData.stats.hp;
    this.maxHp = heroData.stats.hp;
    this.baseSpeed = heroData.stats.speed;
    this.speed = this.baseSpeed;
    this.kills = 0; // Track match kills

    // Unique Neon Color or Custom Skin
    if (customColor) {
      this.color = customColor;
    } else {
      const hues = [0, 60, 120, 180, 240, 300];
      const randomHue =
        hues[Math.floor(Math.random() * hues.length)] +
        Math.floor(Math.random() * 40 - 20);
      this.color = `hsl(${randomHue}, 100%, 50%)`;
    }

    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      shift: false,
    };
    this.mouseAngle = 0;
    this.cooldowns = { skill: 0, shoot: 0 };

    // STATES
    this.shieldActive = false;
    this.isPhasing = false; // Walk through walls
    this.isInvisible = false;
    this.isRooted = false; // Cannot move
    this.rapidFire = false; // Fast shooting
    this.isSkillActive = false; // Visual Aura Flag
    this.freezeShotsActive = false; // Frost skill duration flag

    // SPRINT STAMINA (Battle Royale only)
    this.stamina = 100;
    this.maxStamina = 100;
    this.lastSprintTime = 0;

    // BATTLE ROYALE STATS
    // REGEN LOGIC
    this.lastDamageTime = Date.now();
    this.lastShootTime = 0;
    this.powerCores = 0; // Initialize Cores
  }

  takeDamage(amount) {
    if (this.shieldActive) amount *= 0.5; // Shield 50% mitigation
    this.hp -= amount;
    this.lastDamageTime = Date.now();
  }

  regenerate(dt) {
    // No Regen if Skill Active (User Request)
    if (this.isSkillActive) return;

    if (this.hp < this.maxHp && this.hp > 0) {
      const timeSinceDamage = Date.now() - this.lastDamageTime;
      const timeSinceShot = Date.now() - this.lastShootTime;

      if (timeSinceDamage > 5000 && timeSinceShot > 5000) {
        // Regen 5 HP/sec (Slower)
        this.hp += 5 * dt;
        if (this.hp > this.maxHp) this.hp = this.maxHp;
      }
    }
  }

  addCore() {
    this.powerCores++;
    // SCALING: +120 HP (User Request), +9 Damage (Flat)
    this.maxHp += 120;
    this.hp += 120; // Heal on pickup
  }

  update(dt) {
    // Regenerate HP
    this.regenerate(dt);

    // Cooldown tick
    if (this.cooldowns.skill > 0) this.cooldowns.skill -= dt * 1000;
    if (this.cooldowns.shoot > 0) this.cooldowns.shoot -= dt * 1000;

    // STAMINA REGENERATION (Battle Royale Sprint)
    const now = Date.now();
    const timeSinceLastSprint = now - this.lastSprintTime;

    // Regenerate stamina if not sprinting for 4 seconds
    if (timeSinceLastSprint > 4000 && this.stamina < this.maxStamina) {
      this.stamina += 25 * dt; // Regenerate 25 stamina per second
      if (this.stamina > this.maxStamina) this.stamina = this.maxStamina;
    }

    // VOLT: STATIC FIELD DAMAGE
    if (this.staticFieldActive) {
      if (!this.lastStaticZap) this.lastStaticZap = 0;
      const now = Date.now();
      if (now - this.lastStaticZap > 200) {
        // Zap every 0.2s
        this.lastStaticZap = now;
        // The Player class doesn't have access to other players list directly.
        // We must mark this state for the GameServer to handle, OR return a 'result' from update?
        // Player.update() usually doesn't return results.
        // Better approach: GameServer handles the damage look via a flag, OR we use a flag here.
        // Wait, I see 'stormActive' logic in GameServer being handled there.
        // Let's use the same pattern: 'staticFieldActive' flag is checked in GameServer.
      }
    }

    if (this.isRooted) return; // Skip movement

    // SPRINT LOGIC (Battle Royale)
    let sprintMultiplier = 1.0;
    if (this.keys.shift && this.stamina > 0) {
      sprintMultiplier = 1.5; // 50% speed boost
      this.stamina -= 20 * dt; // Consume 20 stamina per second
      if (this.stamina < 0) this.stamina = 0;
      this.lastSprintTime = Date.now();
    }

    // Basic movement logic
    const moveStep = this.speed * sprintMultiplier * dt;

    // --- X AXIS MOVEMENT ---
    let dx = 0;
    if (this.keys.a) dx -= moveStep;
    if (this.keys.d) dx += moveStep;

    if (dx !== 0) {
      const nextX = this.x + dx;
      let colX = false;
      if (!this.isPhasing) {
        const pRect = { x: nextX - 20, y: this.y - 20, w: 40, h: 40 };
        const obstacles = this.currentMapObstacles || [];
        for (const obs of obstacles) {
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            colX = true;
            break;
          }
        }
      }
      if (!colX) this.x = nextX;
    }

    // --- Y AXIS MOVEMENT ---
    let dy = 0;
    if (this.keys.w) dy -= moveStep;
    if (this.keys.s) dy += moveStep;

    if (dy !== 0) {
      const nextY = this.y + dy;
      let colY = false;
      if (!this.isPhasing) {
        const pRect = { x: this.x - 20, y: nextY - 20, w: 40, h: 40 };
        const obstacles = this.currentMapObstacles || [];
        for (const obs of obstacles) {
          if (
            pRect.x < obs.x + obs.w &&
            pRect.x + pRect.w > obs.x &&
            pRect.y < obs.y + obs.h &&
            pRect.y + pRect.h > obs.y
          ) {
            colY = true;
            break;
          }
        }
      }
      if (!colY) this.y = nextY;
    }

    // Clamp to map
    const limits = this.mapLimits || { width: 1600, height: 1200 }; // Default to Arena
    this.x = Math.max(0, Math.min(limits.width, this.x));
    this.y = Math.max(0, Math.min(limits.height, this.y));
  }

  shoot() {
    if (this.cooldowns.shoot > 0 || this.isFrozen) return null;

    this.lastShootTime = Date.now(); // Reset regen on shoot

    // Fire rate: 0.3s normally
    // Blaze: 0.05s (Super Fast)
    // Ghost/Brawler (Rapid Fire): 0.09s (Hyper Fast)
    let rapidDelay = this.hero.name === "Blaze" ? 50 : 90; // Reduced from 150 to 90 (User Request)
    this.cooldowns.shoot = this.rapidFire ? rapidDelay : 300;

    const speed = this.minesActive ? 600 : 600; // Reduced Mine Speed to 600 (User Request)
    const vx = Math.cos(this.mouseAngle) * speed;
    const vy = Math.sin(this.mouseAngle) * speed;
    const spawnX = this.x + Math.cos(this.mouseAngle) * 30;
    const spawnY = this.y + Math.sin(this.mouseAngle) * 30;

    return {
      id: Math.random().toString(36).substr(2, 9),
      x: spawnX,
      y: spawnY,
      vx,
      vy,
      ownerId: this.id,
      color: this.freezeShotsActive ? "#00ffff" : this.color,
      effect: this.freezeShotsActive ? "FREEZE" : null,
      damage: this.damageBuff ? 30 : this.minesActive ? 60 : 15, // Mines high damage
      type: this.minesActive ? "MINE_PROJ" : "PROJECTILE",
      friction: this.minesActive ? true : false, // Logic flag for friction
      life: this.minesActive ? 12000 : 2000,
      isPoison: this.isPoisonous,
    };
  }

  createProjectile(
    x,
    y,
    angle,
    speed,
    life,
    damage,
    color,
    radius,
    type,
    friction = false
  ) {
    return {
      id: Math.random().toString(36).substr(2, 9),
      ownerId: this.id,
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: life,
      maxLife: life,
      damage: damage,
      color: color,
      radius: radius || 10,
      type: type || "PROJECTILE",
      friction: friction,
    };
  }

  useSkill() {
    if (this.cooldowns.skill > 0) return;
    this.cooldowns.skill = this.hero.stats.cooldown;
    const name = this.hero.name;

    // Generic: Set Active Flag
    this.isSkillActive = true;
    let duration = 0;

    let result = null;

    // === TANK ===
    if (name === "Vanguard") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      this.shieldActive = true;
      setTimeout(() => (this.shieldActive = false), 3000);
    } else if (name === "Titan") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      this.hp = Math.min(this.hp + 200, this.maxHp + 200);
      this.isUnstoppable = true; // Buff: Immune to Slow/Stun
      // this.speed = this.baseSpeed * 0.5; // REMOVED Speed Penalty
      setTimeout(() => {
        // this.speed = this.baseSpeed;
        this.isUnstoppable = false;
      }, 5000);
    } else if (name === "Brawler") {
      this.cooldowns.skill += 3000;
      duration = 2000; // Nerfed Duration
      this.rapidFire = true;
      this.speed = this.baseSpeed * 1.3;
      this.lifestealActive = true; // Buff: Vampirism
      setTimeout(() => {
        this.rapidFire = false;
        this.speed = this.baseSpeed;
        this.lifestealActive = false;
      }, 2000);
    } else if (name === "Goliath") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      this.shieldActive = true;
      this.hp = Math.min(this.maxHp, this.hp + 100);

      // BUFF: SEISMIC SLAM (Immediate AOE)
      result = {
        type: "SEISMIC_SLAM",
        ownerId: this.id,
        x: this.x,
        y: this.y,
        radius: 250,
        damage: 0, // No Damage, only Push (User Request)
        knockback: 400,
        color: "#ffaa00", // Orange Impact
      };

      setTimeout(() => {
        // this.isRooted = false; // Removed Root
        this.shieldActive = false;
      }, 3000);
    }

    // === SPEED ===
    else if (name === "Spectre") {
      duration = 1500;
      this.cooldowns.skill += 6000;
      // PHASE SHIFT: Invulnerability + Super Speed + Phase
      this.speed = this.baseSpeed * 3;
      this.isPhasing = true;
      this.isInvincible = true; // New Buff
      setTimeout(() => {
        this.speed = this.baseSpeed;
        this.isPhasing = false;
        this.isInvincible = false;
        this.checkUnstuck();
      }, 1500);
    } else if (name === "Volt") {
      this.cooldowns.skill += 4000;
      duration = 3000;
      // STATIC DISCHARGE: Speed + Auto-Zap Nearby Enemies
      this.speed = this.baseSpeed * 2.5;
      this.staticFieldActive = true; // Handled in update loop
      this.lastTrailX = this.x; // CRITICAL FIX: Initialize for distance check
      this.lastTrailY = this.y;

      // Auto-damage logic needs to be in update loop, but for now we set the flag
      setTimeout(() => {
        this.speed = this.baseSpeed;
        this.staticFieldActive = false;
      }, 3000);
    } else if (name === "Ghost") {
      console.log("[SERVER] Ghost Phasing Triggered");
      this.cooldowns.skill += 5000;

      // PHASE SHIFT: Speed + Phasing + Rapid Fire (No Teleport)
      // "Transparent, tout lui traverse, plus rapide, tire plus vite"

      this.speed = this.baseSpeed * 1.5; // Speed Boost
      this.isPhasing = true; // Immunity
      this.rapidFire = true; // Fast Fire
      this.isSkillActive = true; // Visuals

      setTimeout(() => {
        this.speed = this.baseSpeed;
        this.isPhasing = false;
        this.rapidFire = false;
        this.isSkillActive = false;
        this.checkUnstuck(); // Fix: Teleport out of wall if stuck
      }, 3000); // 3s Duration

      // Fear Wave Effect (Optional? User didn't ask to remove, but "tout lui traverse" implies passive. Keeping for impact or remove?)
      // User said "je veux juste qu'il sois transparent...". I will remove the Fear Wave to be safe and stick to "Juste transparent + buff".
      result = null;
    }

    // === DAMAGE ===
    else if (name === "Blaze") {
      this.cooldowns.skill += 3000;
      duration = 3000;
      // Rapid Fire + Speed Boost (Buff)
      this.rapidFire = true;
      this.speed = this.baseSpeed * 1.4; // Added Speed
      this.hasFireTrail = true; // Visual + Mechanic?
      setTimeout(() => {
        this.rapidFire = false;
        this.speed = this.baseSpeed;
        this.hasFireTrail = false;
      }, 3000);
    } else if (name === "Frost") {
      this.cooldowns.skill += 5000;
      duration = 5000;
      // Freeze Shot: All shots freeze for 5s
      this.freezeShotsActive = true;
      setTimeout(() => {
        this.freezeShotsActive = false;
      }, 5000);
    } else if (name === "Sniper") {
      duration = 500;
      // Railgun Shot (Instant)

      const speed = 2500; // Faster (User Request)
      result = {
        type: "SNIPER_SHOT", // Custom Type for Trail
        id: Math.random().toString(36).substr(2, 9),
        x: this.x,
        y: this.y,
        vx: Math.cos(this.mouseAngle) * speed,
        vy: Math.sin(this.mouseAngle) * speed,
        ownerId: this.id,
        color: "#fff",
        life: 3000,
        damage: 1000, // One Shot
        penetrateWalls: false, // Wall Hack REMOVED (User Request)
        trailDuration: 1500, // Metadata for Client
      };
    } else if (name === "Shadow") {
      this.cooldowns.skill += 5000;
      // Stealth
      this.isInvisible = true;
      setTimeout(() => (this.isInvisible = false), 5000);
    } else if (name === "Nova") {
      // PROPOSAL: "Supernova"
      // Charge for 0.5s, then massive radial explosion around player.

      this.cooldowns.skill += 5000; // Total ~10s CD
      duration = 800; // Charge time visual (Sync with Server)

      // Mark state for GameServer to handle explosion
      this.supernovaStartTime = Date.now();

      // No projectile. The player IS the bomb.
      result = {
        type: "SUPERNOVA_CHARGE",
        ownerId: this.id,
        x: this.x,
        y: this.y,
      };
    }

    // --- NEW HEROES (EXPANSION) ---
    else if (name === "Citadel") {
      duration = 3000;
      // Fortress Mode: Invincible + Reflect + Slow Move (Buff)
      this.isInvincible = true;
      this.speed = this.baseSpeed * 0.5; // BUFF: Can move now
      this.shieldActive = true;
      this.reflectDamage = true; // BUFF: Thorns
      setTimeout(() => {
        this.isInvincible = false;
        this.speed = this.baseSpeed;
        this.shieldActive = false;
        this.reflectDamage = false;
      }, 3000);
    } else if (name === "Magma") {
      duration = 500;
      // Lava Wave: 5 Projectiles Fan (Buffed)
      const projs = [];
      const fanAngle = 0.25; // Slightly tighter spread for 5 shots
      // Fan from -2 to 2 (5 shots)
      for (let i = -2; i <= 2; i++) {
        const angle = this.mouseAngle + i * fanAngle;
        projs.push(
          this.createProjectile(
            this.x,
            this.y,
            angle,
            750, // speed (Buffed from 700)
            1500, // life
            95, // damage (Buffed from 80)
            "#ff4500", // color
            12, // radius (Slightly larger)
            "LAVA_WAVE",
            true // penetrateEnemies
          )
        );
      }
      result = projs;
    } else if (name === "Storm") {
      duration = 5000;
      this.cooldowns.skill += 5000; // Cooldown starts after usage
      // TESLA STORM: Speed + Auto-Zap (Handled in Manager)
      this.stormActive = true;
      this.speed = this.baseSpeed * 1.6; // +60% Speed Boost (User Request)

      setTimeout(() => {
        this.stormActive = false;
        this.speed = this.baseSpeed;
      }, 5000);

      result = null; // No immediate projectile, passive effect
    } else if (name === "Viper") {
      duration = 5000;
      // Venom: Poisonous shots
      this.isPoisonous = true;
      setTimeout(() => (this.isPoisonous = false), 5000);
    } else if (name === "Mirage") {
      duration = 4000;
      this.cooldowns.skill += 5000;

      // LEGION: Spawn 3 Decoys + Stealth
      this.isInvisible = true;
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.isInvisible = false;
        this.speed = this.baseSpeed;
      }, 4000);

      const decoys = [];
      const spreadRadius = 150;
      const baseAngle = Math.random() * 6.28;
      const angles = [
        baseAngle,
        baseAngle + (Math.PI * 2) / 3,
        baseAngle + (Math.PI * 4) / 3,
      ];

      const obstacles = this.currentMapObstacles || [];
      const mapW = this.mapLimits ? this.mapLimits.width : 2000;
      const mapH = this.mapLimits ? this.mapLimits.height : 2000;

      for (let offset of angles) {
        let finalX = this.x + Math.cos(offset) * spreadRadius;
        let finalY = this.y + Math.sin(offset) * spreadRadius;

        // --- COLLISION \u0026 BOUNDS CHECK ---
        // Simple Raycast from Player to Target to prevent wall clipping
        const steps = 10;
        let validX = this.x;
        let validY = this.y;

        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const tx = this.x + (finalX - this.x) * t;
          const ty = this.y + (finalY - this.y) * t;

          // 1. Check Bounds
          if (tx < 50 || tx > mapW - 50 || ty < 50 || ty > mapH - 50) {
            break; // Stop at last valid
          }

          // 2. Check Obstacles
          let hit = false;
          for (const obs of obstacles) {
            if (
              tx > obs.x - 20 &&
              tx < obs.x + obs.w + 20 &&
              ty > obs.y - 20 &&
              ty < obs.y + obs.h + 20
            ) {
              hit = true;
              break;
            }
          }

          if (hit) break; // Stop at last valid

          // If safe, update valid pos
          validX = tx;
          validY = ty;
        }

        finalX = validX;
        finalY = validY;
        // -------------------------------------

        decoys.push({
          type: "DECOY",
          x: finalX,
          y: finalY,
          ownerId: this.id,
          heroName: this.hero.name,
          heroClass: this.hero.class,
          username: this.username,
          hp: this.maxHp,
          maxHp: this.maxHp,
          powerCores: this.powerCores,
          color: this.color,
          vx: Math.cos(this.mouseAngle + offset) * this.baseSpeed,
          vy: Math.sin(this.mouseAngle + offset) * this.baseSpeed,
          life: 3000,
        });
      }
      result = decoys;
    } else if (name === "Jumper") {
      duration = 500;
      // WARP STRIKE: Teleport + Area Blast
      const maxDist = 450;
      const targetX = this.x + Math.cos(this.mouseAngle) * maxDist;
      const targetY = this.y + Math.sin(this.mouseAngle) * maxDist;

      // Simple raycast/clamp
      this.x = Math.max(0, Math.min(2000, targetX));
      this.y = Math.max(0, Math.min(2000, targetY));
      this.checkUnstuck();

      this.cooldowns.skill += 3500;

      result = {
        type: "WARP_BLAST",
        ownerId: this.id,
        x: this.x,
        y: this.y,
        radius: 200,
        damage: 50,
        knockback: 600,
        color: "#00fa9a",
      };
    }

    // === SUPPORT ===
    else if (name === "Techno") {
      duration = 3000;
      this.cooldowns.skill += 3000;
      // Buff: Speed + Shoot Mines
      this.minesActive = true; // Flag for shoot()
      this.speed = this.baseSpeed * 1.5;
      setTimeout(() => {
        this.minesActive = false;
        this.speed = this.baseSpeed;
      }, 3000);
      // result = ... REMOVED Drop Mine
      result = null; // No immediate effect, just buff
    } else if (name === "Engineer") {
      this.cooldowns.skill += 10000; // 10s Cooldown
      duration = 8000; // Restored (Fixed regression)
      // Force Field Wall - Protective (Perpendicular to Aim)
      const dist = 60;
      const wx = this.x + Math.cos(this.mouseAngle) * dist;
      const wy = this.y + Math.sin(this.mouseAngle) * dist;

      // Base Size
      const baseW = 80;
      const baseH = 20;

      // Perpendicular Angle (90 degrees offset)
      const wallAngle = this.mouseAngle + Math.PI / 2;

      // Calculate AABB for Server Collision using NEW angle
      const absCos = Math.abs(Math.cos(wallAngle));
      const absSin = Math.abs(Math.sin(wallAngle));
      const aabbW = baseW * absCos + baseH * absSin;
      const aabbH = baseW * absSin + baseH * absCos;

      result = {
        type: "WALL_TEMP",
        ownerId: this.id,
        x: wx - aabbW / 2,
        y: wy - aabbH / 2,
        w: aabbW,
        h: aabbH,
        baseW: baseW,
        baseH: baseH,
        life: 8000,
        angle: wallAngle,
      };
    } else if (name === "Medic") {
      duration = 500;
      // Self Heal (Instant)
      this.hp = Math.min(this.maxHp, this.hp + 100);
    }

    // === COMMON AURA LOGIC ===
    if (duration > 0 && name !== "Shadow") {
      setTimeout(() => {
        this.isSkillActive = false;
      }, duration);
    } else if (name !== "Shadow") {
      this.isSkillActive = false;
    } else {
      // Shadow: ensure false
      this.isSkillActive = false;
    }

    return result;
  }
  checkUnstuck() {
    // 1. Check if currently inside wall
    let collided = false;
    const pRect = { x: this.x - 20, y: this.y - 20, w: 40, h: 40 };

    // Need obstacles from GameServer context
    const obstacles = this.currentMapObstacles || [];

    for (const obs of obstacles) {
      if (
        pRect.x < obs.x + obs.w &&
        pRect.x + pRect.w > obs.x &&
        pRect.y < obs.y + obs.h &&
        pRect.y + pRect.h > obs.y
      ) {
        collided = true;
        break;
      }
    }

    if (!collided) return; // All good

    // 2. Try to find a safe spot nearby (Spiral Search)
    const offsets = [
      { x: 0, y: -50 },
      { x: 0, y: 50 },
      { x: -50, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: -50, y: 50 },
      { x: 0, y: -100 },
      { x: 0, y: 100 },
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ];

    for (const off of offsets) {
      const testX = this.x + off.x;
      const testY = this.y + off.y;
      const testRect = { x: testX - 20, y: testY - 20, w: 40, h: 40 };
      let safe = true;

      const obstacles = this.currentMapObstacles || [];
      for (const obs of obstacles) {
        if (
          testRect.x < obs.x + obs.w &&
          testRect.x + testRect.w > obs.x &&
          testRect.y < obs.y + obs.h &&
          testRect.y + testRect.h > obs.y
        ) {
          safe = false;
          break;
        }
      }

      if (safe) {
        // Teleport to safe spot
        this.x = testX;
        this.y = testY;
        return;
      }
    }

    // 3. Fallback: Safety Spawn (Don't Kill)
    // If deep stuck, warp to map center or default spawn
    this.x = 400;
    this.y = 300;
  }
}

module.exports = Player;
