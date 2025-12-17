<script setup>
import { onMounted, onUnmounted, ref, nextTick } from "vue";
import { useRouter, useRoute } from "vue-router";
import { io } from "socket.io-client";
import nipplejs from "nipplejs";
import { useGameStore } from "../stores/game";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const route = useRoute();
const gameStore = useGameStore();
const auth = useAuthStore();

const canvasRef = ref(null);
const bushCanvas = document.createElement("canvas"); // Offscreen
const bushCtx = bushCanvas.getContext("2d");

const socket = ref(null);
const isMobile = ref(false);

// Joysticks
let joyManager = null;

const skillCD = ref(0);
const maxSkillCD = ref(1);

// Game State
let players = [];
let projectiles = [];
let entities = []; // Mines
const playerVisuals = ref({}); // { [playerId]: { flashTime: 0 } }
let mapData = null;
const isDead = ref(false);
const killedBy = ref("");
const killedByHero = ref("");
const respawnTimer = ref(0);
const killMessages = ref([]); // { id, text }

let animationId;
let cameraX = 0;
let cameraY = 0;
let myId = null;

// BR STATE
const inQueue = ref(true);
const queueCount = ref(0);
const queueMax = ref(14);
const queuePlayers = ref([]); // List of names
const customStatus = ref("");
const aliveCount = ref(0);
const powerCores = ref(0); // My gems
const queueTimerVal = ref(0);
const countdownVal = ref(0);
const showCountdown = ref(false);
const spectatingId = ref(null);
const myRank = ref(0);
const earnedCoins = ref(0);
const winnerName = ref("");
const isWinner = ref(false);

let brZone = null;
let crates = [];
let items = []; // Gems

// VFX State
let shakeIntensity = 0;
let shakeDuration = 0;
let shakeX = 0;
let shakeY = 0;
let flashAlpha = 0;

const addScreenShake = (intensity, duration) => {
  shakeIntensity = intensity;
  shakeDuration = duration;
};

const triggerFlash = (alpha) => {
  flashAlpha = alpha;
};

// Assets
const iceImg = new Image();
iceImg.src = "/assets/ice_cube.png";

// Inputs
const keys = { w: false, a: false, s: false, d: false, space: false };
let mouseAngle = 0;

// Config
const VIEWPORT_W = window.innerWidth;
const VIEWPORT_H = window.innerHeight;

onMounted(async () => {
  if (!gameStore.selectedHeroId) {
    router.push("/dashboard");
    return;
  }

  // Ensure Auth Profile is loaded (Fix for "Unknown" on refresh)
  if (auth.token && !auth.user) {
    await auth.fetchProfile();
  }
  // Ensure Heroes are loaded (Fix for "HERO: UNKNOWN" & Skin Color on refresh)
  if (gameStore.allHeroes.length === 0 && auth.token) {
    await gameStore.fetchHeroes();
  }

  // Auto-detect URL for production (same origin), localhost for dev
  const socketUrl = import.meta.env.PROD
    ? window.location.origin
    : "http://localhost:3005";

  socket.value = io(socketUrl);

  // Join Game Logic
  const joinMatch = () => {
    if (!socket.value) return;

    // Reset Local States
    isDead.value = false;
    isWinner.value = false;
    spectatingId.value = null;
    hideDeathOverlay.value = false;
    killMessages.value = [];
    myRank.value = 0;

    // Get Skin Color
    const heroId = gameStore.selectedHeroId;
    const skinIdx = gameStore.getSelectedSkin(heroId);
    const hero = gameStore.allHeroes.find((h) => h.id === heroId);
    const skinColor = hero?.skins[skinIdx]?.value || "#ffffff";

    socket.value.emit("join_game", {
      heroId: heroId,
      username: auth.user?.username,
      skinColor: skinColor,
      token: auth.token,
      mode: route.query.mode || "arena",
    });
  };

  socket.value.on("connect", () => {
    joinMatch();
  });

  socket.value.on("error_message", (msg) => {
    // If rejected from queue (e.g. Match in Progress), show it in the UI
    inQueue.value = true;
    customStatus.value = msg + " (Retrying...)";
    // Retry in 5s
    setTimeout(joinMatch, 5000);
  });

  socket.value.on("game_init", (data) => {
    console.log("GAME INIT RECEIVED", data);
    mapData = data.map;
    myId = data.playerId;
    inQueue.value = false; // FORCE GAME START (Fix for Arena)
    if (!mapData) console.error("MAP DATA MISSING!");
  });

  socket.value.on("queue_update", (data) => {
    inQueue.value = true;
    queueCount.value = data.count;
    queueMax.value = data.max;
    queuePlayers.value = data.players || [];
    // Don't clear customStatus here to preserve "leave" messages briefly if we want
    // But usually queue update overrides. Let's keep it simple.
    // customStatus.value = ""; 
  });

  socket.value.on("queue_notification", (data) => {
    if (data.type === "leave") {
       // Show who left
       customStatus.value = data.message;
       // Clear after 2 seconds
       setTimeout(() => {
          if (customStatus.value === data.message) customStatus.value = "";
       }, 2000);
    }
  });

  socket.value.on("queue_status", (msg) => {
    customStatus.value = msg;
  });

  socket.value.on("queue_timer", (time) => {
    customStatus.value = `MATCH STARTING IN ${time}s`;
  });

  socket.value.on("br_countdown", (count) => {
    inQueue.value = false;
    showCountdown.value = count > 0;
    countdownVal.value = count;
  });

  socket.value.on("br_start", (data) => {
    inQueue.value = false; // Game Start
    mapData = data.map;
    brZone = data.zone;
    myId = data.playerId;
    // Reset VFX
    projectiles = [];
    entities = [];
    playerVisuals.value = {}; // Reset local visual states
    isDead.value = false;
    isWinner.value = false;
    myRank.value = 0;
    myRank.value = 0;
    spectatingId.value = null; // Reset spectate
    hideDeathOverlay.value = false; // Show death screen on next death

    // Pre-spawn Local Player for Countdown Visibility
    if (data.pos) {
      players = [
        {
          id: myId,
          x: data.pos.x,
          y: data.pos.y,
          username: auth.user?.username || "Agent",
          hero: gameStore.selectedHero?.name || "Unknown",
          color: data.color || "#00ccff",
          hp: data.hp || 100, // Real Start HP
          maxHp: data.maxHp || 100, // Real Max HP
          alive: true,
          powerCores: 0,
          heroClass: data.heroClass || "Vanguard", // Ensure correct shape
        },
      ];
      // Center Camera Immediately
      cameraX = data.pos.x - window.innerWidth / 2;
      cameraY = data.pos.y - window.innerHeight / 2;
    } else {
      players = [];
    }
  });

  const hideDeathOverlay = ref(false);

  socket.value.on("br_update", (data) => {
    // Full State Pack
    players = data.players;
    projectiles = data.projectiles;
    entities = data.entities;
    crates = data.crates || [];
    items = data.items || [];
    brZone = data.zone;
    aliveCount.value = data.aliveCount || 0;

    // Find my stats
    const me = players.find((p) => p.id === myId);
    if (me) {
      powerCores.value = me.powerCores || 0;
      skillCD.value = me.skillCD || 0;
      maxSkillCD.value = me.maxSkillCD || 1;
      maxSkillCD.value = me.maxSkillCD || 1;
      // Respect server-side death state
      if (me.isDead) {
        isDead.value = true;
      } else {
        isDead.value = false;
      }
    } else {
      // If not in list, maybe dead or just spectator?
      // Check if we died
      const deadMe = players.find((p) => p.id === myId && p.isDead);

      // If we weren't dead locally but now we are missing or marked dead
      // Actually, manager sends 'isDead: true'
      if (deadMe && deadMe.isDead) {
        isDead.value = true;
      }
    }

    // Auto Spectate & Switch Logic
    if (isDead.value && players.length > 0) {
      const currentTarget = players.find((p) => p.id === spectatingId.value);

      // If Not Spectating OR Target Dead/Missing -> Find New Target
      if (!spectatingId.value || !currentTarget || currentTarget.isDead) {
        const livePlayer = players.find((p) => !p.isDead && p.id !== myId);
        if (livePlayer) {
          spectatingId.value = livePlayer.id;
        }
      }
    }
  });

  socket.value.on("br_rewards", (data) => {
    console.log("CLIENT RECEIVED COINS:", data.coins);
    earnedCoins.value = data.coins;
  });

  socket.value.on("br_eliminated", (data) => {
    isDead.value = true;
    myRank.value = data.rank;
    if (data.killedBy) killedBy.value = data.killedBy;
    if (data.killedByHero) killedByHero.value = data.killedByHero;

    // Auto Spectate Killer
    if (data.killerId) {
      spectatingId.value = data.killerId;
    }
  });

  socket.value.on("br_game_over", (data) => {
    console.log("GAME OVER. Winner:", data.winner, "Coins:", data.coinsEarned);
    winnerName.value = data.winner;

    // Only show Winner Coins if I am the winner
    if (auth.user && data.winner === auth.user.username) {
      isWinner.value = true;
      if (data.coinsEarned) earnedCoins.value = data.coinsEarned;
    }

    setTimeout(() => router.push("/dashboard"), 8000);
  });

  socket.value.on("player_died", (data) => {
    spawnExplosion(data.x, data.y, data.color);
  });

  socket.value.on("visual_effect", (data) => {
    if (data.type === "shockwave") {
      createShockwave(data.x, data.y, data.color || "#ffffff");
      spawnExplosion(data.x, data.y, data.color || "#ffffff");
    } else if (data.type === "poison_hit") {
      spawnExplosion(data.x, data.y, "#32cd32");
    } else if (data.type === "hit") {
      spawnHitSparks(data.x, data.y, data.color);
      // Sprite Flash Logic
      if (data.targetId) {
        if (!playerVisuals.value[data.targetId]) {
          playerVisuals.value[data.targetId] = { flashTime: 0 };
        }
        playerVisuals.value[data.targetId].flashTime = 78; // Flash for 1.3 seconds (78 frames @ 60fps)
      }
    } else if (data.type === "black_hole_explode") {
      spawnExplosion(data.x, data.y, "#d000ff");
      createShockwave(data.x, data.y, "#bf00ff");
      addScreenShake(15, 20);
      triggerFlash(0.5);
    } else if (data.type === "supernova_blast") {
      // SUPERNOVA VISUALS
      createShockwave(data.x, data.y, "#da70d6"); // Orchid
      spawnExplosion(data.x, data.y, "#da70d6");
      addScreenShake(20, 20); // Heavy Shake
      triggerFlash(0.8); // Bright Flash
    } else if (data.type === "supernova_cast") {
      // Charge Up Effect (Sound / Small Flash)
      // Maybe a small reverse shockwave?
    }
  });

  socket.value.on("kill_confirmed", (data) => {
    const id = Date.now();
    killMessages.value.push({ id, text: `YOU ELIMINATED ${data.victim}` });
    setTimeout(() => {
      const idx = killMessages.value.findIndex((m) => m.id === id);
      if (idx !== -1) killMessages.value.splice(idx, 1);
    }, 3000);
  });

  socket.value.on("server_update", (state) => {
    players = state.players;
    projectiles = state.projectiles; // Bullets
    entities = state.entities; // Mines

    // Update My HUD Stats
    const me = players.find((p) => p.id === myId);
    if (me) {
      skillCD.value = me.skillCD || 0; // Default to 0 if undefined
      maxSkillCD.value = me.maxSkillCD || 5000;
      isDead.value = !!me.isDead;
      if (isDead.value) {
        killedBy.value = me.killedBy || "Unknown";
        killedByHero.value = me.killedByHero || "?";
      }
      if (isDead.value && me.respawnTime) {
        respawnTimer.value = Math.ceil(
          Math.max(0, me.respawnTime - Date.now()) / 1000
        );
      }
    } else {
      // Fallback if player dead or not found (and not in list yet)
      skillCD.value = 0;
    }
  });

  window.addEventListener("keydown", handleKey);
  window.addEventListener("keyup", handleKey);
  window.addEventListener("mousemove", handleMouse);
  window.addEventListener("keypress", handleSkill);
  window.addEventListener("resize", handleResize);

  const ctx = canvasRef.value.getContext("2d");

  // Strict Mobile Check: Width < 768 AND Touch Capability
  const isTouch =
    navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
  isMobile.value = window.innerWidth <= 768 && isTouch;

  canvasRef.value.width = window.innerWidth;
  canvasRef.value.height = window.innerHeight;
  bushCanvas.width = window.innerWidth;
  bushCanvas.height = window.innerHeight;

  if (isMobile.value) {
    await nextTick();
    try {
      initMobileControls();
    } catch (err) {
      console.error("Mobile init failed:", err);
    }
  }

  loop(ctx);

  setInterval(() => {
    if (socket.value) {
      socket.value.emit("client_input", { keys, mouseAngle });
    }
  }, 30);
});

const handleResize = () => {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth;
    canvasRef.value.height = window.innerHeight;
    bushCanvas.width = window.innerWidth;
    bushCanvas.height = window.innerHeight;
  }
};

// Add listener in the MAIN onMounted logic if possible, or just add a separate one.
// The file has one big onMounted at line ~356.
// I inserted a NEW onMounted block above. This is valid in Vue 3 (multiple hooks run in order),
// BUT it's messy.
// Let's just keep the listener addition here.

onMounted(() => {
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  if (socket.value) {
    socket.value.emit("leave_queue");
    socket.value.disconnect();
  }
  window.removeEventListener("keydown", handleKey);
  window.removeEventListener("keyup", handleKey);
  window.removeEventListener("mousemove", handleMouse);
  window.removeEventListener("keypress", handleSkill);
  window.removeEventListener("resize", handleResize);
  cancelAnimationFrame(animationId);
});

const handleKey = (e) => {
  if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
    keys[e.key.toLowerCase()] = e.type === "keydown";
  }
  if (e.code === "Space") {
    keys.space = e.type === "keydown";
  }
};

const handleMouse = (e) => {
  // Calculate angle relative to center of screen (since camera follows player)
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  mouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
};

const handleSkill = (e) => {
  if (e.key.toLowerCase() === "e") socket.value.emit("skill_trigger");
};

// --- MOBILE CONTROLS ---
const initMobileControls = () => {
  // 1. Movement Joystick (Left)
  const leftZone = document.getElementById("zone-joystick-left");
  const joyLeft = nipplejs.create({
    zone: leftZone,
    mode: "static",
    position: { left: "80px", bottom: "80px" },
    color: "#00f3ff",
    size: 100,
  });

  joyLeft.on("move", (evt, data) => {
    if (data.angle) {
      // Reset all movement keys first
      keys.w = false;
      keys.a = false;
      keys.s = false;
      keys.d = false;

      // Map Angle to WASD (Basic 8-direction approximation or just threshold)
      const deg = data.angle.degree;

      // Up (45-135)
      if (deg > 45 && deg < 135) keys.w = true;
      // Down (225-315)
      if (deg > 225 && deg < 315) keys.s = true;
      // Left (135-225)
      if (deg > 135 && deg < 225) keys.a = true;
      // Right (315-360 or 0-45)
      if (deg > 315 || deg < 45) keys.d = true;
    }
  });

  joyLeft.on("end", () => {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
  });

  // 2. Aim Joystick (Right)
  const rightZone = document.getElementById("zone-joystick-right");
  const joyRight = nipplejs.create({
    zone: rightZone,
    mode: "static",
    position: { right: "80px", bottom: "80px" },
    color: "#ff00ff",
    size: 100,
  });

  joyRight.on("move", (evt, data) => {
    if (data.angle) {
      // NippleJS gives angle in radians (data.angle.radian) relative to X axis properly?
      // NOTE: nipplejs radian is mathematical (counter-clockwise from Right).
      // Canvas Math.atan2(y, x) is similar.
      // We just need to invert Y if needed?
      // NippleJS: Up is 90deg (PI/2). Down is 270deg.
      // Screen Coords: Up is -Y.
      // So if Nipple says UP, vector is (0, 1) in its world?
      // Actually, we can just use the vector directly.
      // BUT `mouseAngle` is expected to be `Math.atan2(y, x)` relative to player center.
      // Nipple radian should match directly EXCEPT Y-axis flip might be needed if "Up" means positive Y for Nipple but negative Y for Screen.
      // Joystick "Up" => angle 90 deg => -Y in screen.
      // Let's rely on data.angle.radian but verify direction.
      // If we drag UP, angle is PI/2.
      // In game loop, we just use this angle for rotation.
      // Standard canvas rotation: +Y is Down.
      // If I want to face UP, I need -Y. atan2(-1, 0) = -PI/2.
      // Nipple UP is +PI/2. So we negate the angle?
      mouseAngle = -data.angle.radian;
    }
  });
};

const triggerSkill = () => {
  socket.value.emit("skill_trigger");
};

const startShooting = () => {
  keys.space = true;
};

const stopShooting = () => {
  keys.space = false;
};

// === RENDERING ===
// === RENDERING ===
const drawGrid = (ctx) => {
  if (!mapData) return;

  // Draw Infinite Grid
  ctx.strokeStyle = "#222233";
  ctx.lineWidth = 2;
  const gridSize = 100;

  const startX = Math.floor(cameraX / gridSize) * gridSize;
  const startY = Math.floor(cameraY / gridSize) * gridSize;

  for (
    let x = startX;
    x < startX + window.innerWidth + gridSize;
    x += gridSize
  ) {
    ctx.beginPath();
    // Pixel-Perfect rounding
    const dx = Math.floor(x - cameraX) + 0.5; // +0.5 for crisp canvas lines
    ctx.moveTo(dx, 0);
    ctx.lineTo(dx, window.innerHeight);
    ctx.stroke();
  }
  for (
    let y = startY;
    y < startY + window.innerHeight + gridSize;
    y += gridSize
  ) {
    ctx.beginPath();
    const dy = Math.floor(y - cameraY) + 0.5;
    ctx.moveTo(0, dy);
    ctx.lineTo(window.innerWidth, dy);
    ctx.stroke();
  }

  // Map Boundary
  if (mapData.width < 2000) {
    // ARENA MODE - CLASSIC BLUE NEON
    // ARENA MODE - CLASSIC BLUE NEON
    const pulse = Math.abs(Math.sin(Date.now() / 1000)) * 20 + 10;
    ctx.strokeStyle = "rgba(0, 243, 255, 0.3)"; // Less Luminous (Transparent)
    ctx.lineWidth = 2; // Moderate Line
    ctx.shadowColor = "#00f3ff";
    ctx.shadowBlur = 5; // Restored Subtle Glow (User Request)
    // ROUND COORDS for Boundary
    ctx.strokeRect(
      Math.floor(0 - cameraX),
      Math.floor(0 - cameraY),
      mapData.width,
      mapData.height
    );
  } else {
    // BR MODE - DARK INDUSTRIAL
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 5;
    ctx.shadowBlur = 0;
    ctx.strokeRect(
      Math.floor(0 - cameraX),
      Math.floor(0 - cameraY),
      mapData.width,
      mapData.height
    );
  }
  ctx.shadowBlur = 0; // Reset
};

const drawFloorDeco = (ctx) => {
  if (!mapData) return;

  // Safe Crates Check
  if (!crates) crates = [];

  // DRAW CRATES (Underneath players & walls)
  crates.forEach((c) => {
    // ROUND COORDS
    const sx = Math.floor(c.x - cameraX);
    const sy = Math.floor(c.y - cameraY);

    // Cull Crates
    if (
      sx < -50 ||
      sx > window.innerWidth + 50 ||
      sy < -50 ||
      sy > window.innerHeight + 50
    )
      return;

    if (c.active) {
      // Neon Box - OPAQUE to hide grid lines
      ctx.fillStyle = "#14141e"; // Solid Dark Blue/Black
      // ROUND SIZE to avoid sub-pixel gaps + Overfill (User reported lines)
      ctx.fillRect(sx - 1, sy - 1, Math.ceil(c.w) + 2, Math.ceil(c.h) + 2);

      // Border
      ctx.strokeStyle = "#00f3ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, Math.ceil(c.w), Math.ceil(c.h));

      // Inner Glow (Start Removing expensive Blur)
      // ctx.shadowColor = "#00f3ff";
      // ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(0, 243, 255, 0.1)";
      ctx.fillRect(sx + 5, sy + 5, c.w - 10, c.h - 10);
      // ctx.shadowBlur = 0;

      // X pattern
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + c.w, sy + c.h);
      ctx.moveTo(sx + c.w, sy);
      ctx.lineTo(sx, sy + c.h);
      ctx.strokeStyle = "rgba(0, 243, 255, 0.3)";
      ctx.stroke();
    }

    if (c.hp < c.maxHp) {
      // HP Bar logic...
      // Simplified HP Bar drawing
      const pct = c.hp / c.maxHp;
      const barW = c.w;
      const barH = 5;
      const barX = sx;
      const barY = sy - 10;

      ctx.fillStyle = "#333";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
  });

  // DRAW ITEMS
  items.forEach((i) => {
    // ROUND COORDS
    const sx = Math.floor(i.x - cameraX);
    const sy = Math.floor(i.y - cameraY);

    // Cull Items
    if (
      sx < -20 ||
      sx > window.innerWidth + 20 ||
      sy < -20 ||
      sy > window.innerHeight + 20
    )
      return;

    ctx.fillStyle = "#00ff00"; // Green Gem
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    // Optimized: Removed ShadowBlur, used simplified stroke
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
};

const drawWalls = (ctx) => {
  if (!mapData || !mapData.obstacles) return;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;

  mapData.obstacles.forEach((obs) => {
    // ROUND COORDS
    const screenX = Math.floor(obs.x - cameraX);
    const screenY = Math.floor(obs.y - cameraY);

    // OPTIMIZATION: Viewport Culling
    if (
      screenX + obs.w < -50 ||
      screenX > screenW + 50 ||
      screenY + obs.h < -50 ||
      screenY > screenH + 50
    ) {
      return;
    }

    // Ensure Opaque Draw
    ctx.globalAlpha = 1.0;

    // Wall Body (Solid Black to hide everything under it, e.g. bushes)
    ctx.fillStyle = "#000000";
    // Overfill to prevent sub-pixel gaps (Gray Line Glitch)
    ctx.fillRect(screenX - 1, screenY - 1, Math.ceil(obs.w) + 2, Math.ceil(obs.h) + 2);

    // Neon Glow Border (Simplified for Performance)
    if (obs.type === "WALL") {
      ctx.strokeStyle = "#00f3ff";
    } else if (obs.type === "CORE") {
      ctx.strokeStyle = "#ff00ff";
    } else {
      ctx.strokeStyle = "#ffee00";
    }
    ctx.lineWidth = 2;
    ctx.strokeRect(screenX, screenY, Math.ceil(obs.w), Math.ceil(obs.h));
  });
};

const drawZone = (ctx) => {
  // DRAW ZONE (Simplified)
  if (brZone) {
    const zx = brZone.x - cameraX;
    const zy = brZone.y - cameraY;

    // Pulse
    const pulse = Math.sin(Date.now() / 200) * 5;

    // Draw "Storm" using thick stroke instead of expensive clipping
    ctx.beginPath();
    ctx.arc(zx, zy, brZone.radius + 2000, 0, Math.PI * 2); // Radius + half width covers outside
    ctx.strokeStyle = "rgba(20, 0, 0, 0.4)"; // Storm Color
    ctx.lineWidth = 4000; // Humongous line acts as fill outside
    ctx.stroke();

    // Zone Border
    ctx.beginPath();
    ctx.arc(zx, zy, brZone.radius + pulse, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 50, 50, 0.9)"; // Stronger Red
    ctx.lineWidth = 20;
    ctx.setLineDash([20, 20]); // Tech look
    ctx.stroke();
    ctx.setLineDash([]);
  }
};

// === PARTICLES ===
let particles = [];

const createParticle = (x, y, color, speed, life, type = "circle") => {
  const angle = Math.random() * Math.PI * 2;
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life,
    maxLife: life,
    color,
    type,
    angle: Math.random() * Math.PI, // Rotation for debris
    rotSpeed: (Math.random() - 0.5) * 0.2, // Spin
  });
};

const spawnExplosion = (x, y, color) => {
  // 1. Dust / Smoke (Small)
  for (let i = 0; i < 20; i++) {
    createParticle(
      x,
      y,
      color,
      5 + Math.random() * 10,
      30 + Math.random() * 20
    );
  }
  // 2. Debris (Chunks - Larger, slower)
  for (let i = 0; i < 10; i++) {
    createParticle(
      x,
      y,
      color,
      2 + Math.random() * 8,
      40 + Math.random() * 20,
      "debris"
    );
  }
};

const spawnHitSparks = (x, y, color) => {
  for (let i = 0; i < 15; i++) {
    createParticle(x, y, color, 3 + Math.random() * 6, 15 + Math.random() * 10);
  }
};

// === SHOCKWAVES ===
let shockwaves = [];

const createShockwave = (x, y, color) => {
  shockwaves.push({
    x,
    y,
    color,
    radius: 10,
    maxRadius: 400,
    alpha: 1.0,
    speed: 25, // Fast Expansion
  });
};

const drawShockwaves = (ctx) => {
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.radius += s.speed;
    s.alpha -= 0.04; // Fade out

    if (s.alpha <= 0 || s.radius > s.maxRadius) {
      shockwaves.splice(i, 1);
      continue;
    }

    const sx = s.x - cameraX;
    const sy = s.y - cameraY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 15 * s.alpha; // Thick ring
    ctx.globalAlpha = s.alpha;
    ctx.stroke();
    ctx.restore();
  }
};

const updateParticles = () => {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    if (p.type === "debris") p.angle += p.rotSpeed;
    if (p.life <= 0) particles.splice(i, 1);
  }
};

const drawParticles = (ctx) => {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;

    if (p.type === "debris") {
      ctx.save();
      ctx.translate(p.x - cameraX, p.y - cameraY);
      ctx.rotate(p.angle);
      ctx.fillRect(-3, -3, 6, 6); // Larger
      ctx.restore();
    } else {
      // Standard Spark
      ctx.fillRect(p.x - cameraX, p.y - cameraY, 4, 4);
    }

    ctx.globalAlpha = 1.0;
  });
};

const drawProjectiles = (ctx) => {
  // Batch settings to minimize state changes if possible, but colors vary.
  projectiles.forEach((p) => {
    if (p.type === "MINE") return;

    // BLACK HOLE SHOT (Nova)
    if (p.type === "BLACK_HOLE_SHOT") {
      const sx = Math.floor(p.x - cameraX);
      const sy = Math.floor(p.y - cameraY);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#800080";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      return;
    }

    // MINE PROJECTILE (Techno)
    if (p.type === "MINE_PROJ") {
      const sx = Math.floor(p.x - cameraX);
      const sy = Math.floor(p.y - cameraY);
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#ffaa00";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      // Pulsing effect for sticky mine
      if (Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1) {
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + Math.sin(Date.now() / 200) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 170, 0, 0.5)";
        ctx.stroke();
      }
      return;
    }

    // LAVA WAVE (Magma)
    if (p.type === "LAVA_WAVE") {
      const sx = Math.floor(p.x - cameraX);
      const sy = Math.floor(p.y - cameraY);
      const radius = 25; // Slightly larger

      ctx.save();
      ctx.translate(sx, sy);
      const angle = Math.atan2(p.vy, p.vx);
      ctx.rotate(angle);

      // Layer 1: Core (Yellow/White)
      ctx.fillStyle = "#fff700";
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.6, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Layer 2: Magma (Orange)
      ctx.fillStyle = "rgba(255, 69, 0, 0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Layer 3: Glow
      ctx.shadowBlur = 10; // Moderate Glow
      ctx.shadowColor = "#ff0000";
      ctx.strokeStyle = "#ff4500";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      // Particles (Dripping Lava)
      if (Math.random() > 0.7) {
        createParticle(p.x, p.y, "#ff4500", 2, 10);
      }

      ctx.restore();
      return;
    }

    const sx = Math.floor(p.x - cameraX);
    const sy = Math.floor(p.y - cameraY);

    ctx.fillStyle = p.color || "#fff";

    // FAST GLOW (No ShadowBlur)
    ctx.globalAlpha = 0.6; // Restored Visibility (User Request: "On ne voit plus a qui sont les balles")
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Core
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // VISIBILITY FIX: Outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
};

const drawPlayer = (ctx, p) => {
  // Hide Dead Players (Ghosts) from others
  if (p.isDead && p.id !== myId) return;

  // Round Player position for crisp border rendering (Fix "gray border" or blurry clone)
  const screenX = Math.floor(p.x - cameraX);
  const screenY = Math.floor(p.y - cameraY);

  // OPTIMIZATION: Cull off-screen players
  // Margin 100px for names/bars/effects
  if (
    screenX < -150 ||
    screenX > window.innerWidth + 150 ||
    screenY < -150 ||
    screenY > window.innerHeight + 150
  )
    return;

  const isMe = p.id === myId;
  const primaryColor = p.color || (isMe ? "#00ccff" : "#ff3333");

  // Use Class to determine shape if specific hero not defined
  const heroClass = p.heroClass || p.hero?.class || "Damage";
  const heroName = p.heroName || p.hero?.name || "Unknown";

  // Emit Particles based on Hero (DISABLE if invisible and not me)
  if (Math.random() > 0.5 && (!p.invisible || p.id === myId)) {
    if (heroName === "Spectre") createParticle(p.x, p.y, "#aa00ff", 2, 20); // Purple Trail
    if (heroName === "Vanguard" && p.shield)
      createParticle(p.x, p.y, "#00ffff", 3, 30); // Shield Sparks
  }
  // DRAW PLAYER
  if (p.dead || p.hp <= 0) return; // Hide body on death

  ctx.save();

  // Stealth Handler
  if (p.invisible) {
    // REVEAL LOGIC: Visible if Me OR Flashing (Hit)
    if (p.id !== myId && (!p.flashTime || p.flashTime <= 0)) {
       ctx.restore(); // Restore context before returning
       return; // Total Invisibility (Forces black artifacts to not exist)
    }

    // If visible (Self or Hit), set Ghost Alpha
    if (p.id === myId) ctx.globalAlpha = 0.4;
    else ctx.globalAlpha = 0.6;
  }

  ctx.translate(screenX, screenY);
  ctx.rotate(p.angle + Math.PI / 2);

  // --- DRAW PLAYER SHIP ---
  // Layer 1: Base Hull
  ctx.fillStyle = primaryColor;

  // Flash Glow (Damage)
  // User Request: "Apparition thing works only in bush"
  // We INTERPRET this as: White Flash (Reveal Effect) only for Invisible players.
  // Standard players just get subtle hit feedback or standard shadow.
  if (p.flashTime > 0 && p.invisible) {
    ctx.shadowBlur = 10; // Moderate Neon
    ctx.shadowColor = "#ffffff"; 
  } else {
    ctx.shadowBlur = 5; // Moderate Neon (User Request: "Un peu de neon")
    ctx.shadowColor = primaryColor;
  }

  if (heroClass === "Tank") {
  }

  // --- POISON AURA (VIPER EFFECT) ---
  // Disable if Invisible (unless revealed)
  if (p.isPoisoned && (!p.invisible || p.id === myId || p.flashTime > 0)) {
    ctx.save();
    const time = Date.now() / 200;
    ctx.strokeStyle = "#00FF00"; // Bright Green
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;

    // Bubbling Ring
    ctx.beginPath();
    // Radius pulses
    const r = 35 + Math.sin(time) * 3;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Bubbles
    ctx.fillStyle = "#32cd32";
    for (let i = 0; i < 3; i++) {
      const angle = (time + i * 2) % (Math.PI * 2);
      const br = 25;
      const bx = Math.cos(angle) * br;
      const by = Math.sin(angle) * br;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- ACTIVE SKILL AURA (Energy Pulse) ---
  // Disable if Invisible
  if ((p.isSkillActive || p.shield) && (!p.invisible || p.id === myId || p.flashTime > 0)) {
    const time = Date.now() / 1000; // Seconds

    ctx.save();
    ctx.shadowBlur = 6; // Moderate active skill glow
    ctx.shadowColor = "#FFD700"; // Gold Glow

    // Draw 3 expanding waves
    for (let i = 0; i < 3; i++) {
      // Stagger the waves
      const progress = (time + i * 0.33) % 1; // 0.0 to 1.0

      // Radius expands from 25 to 60
      const radius = 30 + progress * 40;

      // Alpha fades from 0.8 to 0
      const alpha = 0.8 * (1 - progress);

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);

      // Gradient Color: Gold to Cyan
      if (i % 2 === 0) {
        ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`; // Gold
      } else {
        ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`; // Cyan
      }

      ctx.lineWidth = 3 - progress * 2; // Thins out
      ctx.stroke();
    }

    // Core Energy
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 215, 0, 0.2)";
    ctx.fill();

    ctx.restore();
  }

  // --- HERO VISUALS ---
  // Use Class to determine shape if specific hero not defined
  // heroClass already defined above for Aura logic

  if (heroClass === "Tank") {
    // TANK (Hexagon)
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    // Start at Top (-25, 0) logic
    for (let i = 0; i < 6; i++) {
      // Offset angle by -PI/2 to start at Top
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      ctx.lineTo(25 * Math.cos(angle), 25 * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2; // Moderate Border
    ctx.lineJoin = "round";
    ctx.stroke();
    // Shield
    // Shield
    if (p.shield) {
      // CITADEL: 360 Shield if Invincible/Citadel
      if (p.hero === "Citadel" || heroName === "Citadel") {
        ctx.beginPath();
        ctx.arc(0, 0, 45, 0, Math.PI * 2); // Full Circle
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 5;
        ctx.stroke();
        // Force Field Effect
        ctx.fillStyle = "rgba(0, 255, 255, 0.2)";
        ctx.fill();
      } else {
        // Standard Tank Shield (Frontal)
        ctx.beginPath();
        // Arc centered at Top (-PI/2)
        ctx.arc(0, 0, 45, -Math.PI / 2 - 1, -Math.PI / 2 + 1);
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
  } else if (p.isFrozen) {
    // IMPROVED FREEZE VISUAL (Ice Crystal Overlay)
    // Procedural jagged shape
    ctx.save();
    ctx.beginPath();
    const spikes = 8;
    const outerRadius = 45;
    const innerRadius = 25;

    // Shivering effect
    const shiverX = (Math.random() - 0.5) * 3;
    const shiverY = (Math.random() - 0.5) * 3;
    ctx.translate(shiverX, shiverY);

    for (let i = 0; i < spikes; i++) {
      const step = Math.PI / spikes;
      const rot = (Math.PI / 2) * 3;
      let x = 0;
      let y = 0;

      let ang = i * step * 2 + rot;
      x = Math.cos(ang) * outerRadius;
      y = Math.sin(ang) * outerRadius;
      ctx.lineTo(x, y);

      ang = i * step * 2 + step + rot;
      x = Math.cos(ang) * innerRadius;
      y = Math.sin(ang) * innerRadius;
      ctx.lineTo(x, y);
    }
    ctx.closePath();

    ctx.fillStyle = "rgba(0, 243, 255, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else if (heroClass === "Speed") {
    // SPEED (Arrow/Dart) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -30); // Tip Top
    ctx.lineTo(20, 20); // Bottom Right
    ctx.lineTo(0, 10); // Center indent
    ctx.lineTo(-20, 20); // Bottom Left
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2; // Moderate Border
    ctx.lineJoin = "round";
    ctx.stroke();
  } else if (heroClass === "Support") {
    // SUPPORT (Box/Medical) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.fillRect(-20, -20, 40, 40); // Base Box
    ctx.fillStyle = "#fff";

    // Cross / Gun pointing UP
    // Vertical bar sticking out top
    ctx.fillRect(-5, -30, 10, 30);
    // Horizontal Cross bar
    ctx.fillRect(-15, -20, 30, 10);

    ctx.strokeStyle = "#fff"; // Changed from #000 to #fff for consistency
    ctx.lineWidth = 2; // Moderate Border
    ctx.lineJoin = "round";
    ctx.strokeRect(-15, -15, 30, 30); // Inner Detail
  } else {
    // DAMAGE / DEFAULT (Triangle) - Point UP
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.moveTo(0, -30); // Tip Top
    ctx.lineTo(20, 20);
    ctx.lineTo(-20, 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  ctx.stroke();

  // SNIPER LASER SIGHT
  // Visible ONLY to Local Player AND when Skill is Ready (E)
  if (
    (heroName === "Sniper" || p.hero === "Sniper") &&
    p.id === myId &&
    (p.skillCD || 0) <= 0
  ) {
    ctx.beginPath();
    ctx.moveTo(0, -35); // Start at gun tip (outside body)
    ctx.lineTo(0, -2000); // 2000px aiming line (X-Ray)

    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)"; // 0.8 Opacity (Clearer)
    ctx.lineWidth = 2; // Thicker to see dashes
    ctx.setLineDash([20, 20]); // Larger dashes

    // Laser Glow
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 10;

    ctx.stroke();
    ctx.shadowBlur = 0; // Reset
    ctx.setLineDash([]); // Reset Explicitly just in case
  }

  // FROST EFFECT (Frozen Enemy)
  if (p.isFrozen || p.isRooted) {
    // Check property name from server (likely isRooted or custom speed check)
    ctx.save();
    ctx.fillStyle = "rgba(0, 255, 255, 0.4)";
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    // Draw Ice Cube around player
    ctx.fillRect(-25, -25, 50, 50);
    ctx.strokeRect(-25, -25, 50, 50);

    // Crack details
    ctx.beginPath();
    ctx.moveTo(-15, -15);
    ctx.lineTo(0, 0);
    ctx.lineTo(15, -5);
    ctx.stroke();
    ctx.restore();
  }

  // GENERIC AIM CURSOR (Only Local Player)
  if (p.id === myId) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -40); // Tip (Front)
    ctx.lineTo(5, -30); // Back Right
    ctx.lineTo(0, -32); // Indent
    ctx.lineTo(-5, -30); // Back Left
    ctx.fill();
  }

  ctx.restore();

  // === UI ELEMENTS MOVED TO drawPlayerNames (Sorted Z-Index) ===
  // Only Cast Animation remains on the player layer
  if (p.isSkillActive) {
    const time = Date.now() / 200;
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(time);

    // Circle removed as per user request
    ctx.restore();
  }
  ctx.shadowBlur = 0;
};

const getPlayerBushId = (p) => {
  if (!mapData || !mapData.bushes) return -1;
  for (let i = 0; i < mapData.bushes.length; i++) {
    const b = mapData.bushes[i];
    // AABB Check for Rectangular Bushes
    // Player is point (center) vs Rect (b.x, b.y, b.w, b.h)
    // Actually b is defined as center or top-left?
    // Usually Rect is top-left. Let's assume MapData gives top-left x,y and w,h.
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      return i;
    }
  }
  return -1;
};

const drawBushes = (ctx) => {
  if (!mapData || !mapData.bushes) return;

  // 1. Clear Offscreen
  bushCtx.clearRect(0, 0, bushCanvas.width, bushCanvas.height);

  // 2. Draw ALL Bushes OPAQUE on Offscreen
  bushCtx.save();
  // Translate like the main camera
  // We need to apply same translation logic: manual subtraction of cameraX/Y
  // But wait, our 'drawMap' logic uses manual coordinates.
  // So we just draw rects.

  bushCtx.fillStyle = "#0a4d0a"; // Dark bush
  bushCtx.strokeStyle = "#006600";
  bushCtx.lineWidth = 3;

  mapData.bushes.forEach((b) => {
    const sx = b.x - cameraX;
    const sy = b.y - cameraY;
    // Optimization check
    if (
      sx + b.w < -50 ||
      sx > bushCanvas.width + 50 ||
      sy + b.h < -50 ||
      sy > bushCanvas.height + 50
    )
      return;

    bushCtx.fillRect(sx, sy, b.w, b.h);
    bushCtx.strokeRect(sx, sy, b.w, b.h);

    // Highlight (Disabled for Performance)
    // bushCtx.fillStyle = "rgba(255, 255, 255, 0.05)";
    // bushCtx.fillRect(sx + 5, sy + 5, b.w * 0.4, b.h * 0.4);

    bushCtx.fillStyle = "#0a4d0a"; // Reset
  });
  bushCtx.restore();

  // 3. Punch Holes for Vision (Dynamic Fog of War)
  bushCtx.save();
  bushCtx.globalCompositeOperation = "destination-out";

  // A. REVEAL ME
  const me = players.find((p) => p.id === myId);
  if (me) {
    const mx = me.x - cameraX;
    const my = me.y - cameraY;

    // Soft Circle Gradient
    const radius = 320; // Vision Radius
    const grad = bushCtx.createRadialGradient(mx, my, 50, mx, my, radius);
    grad.addColorStop(0, "rgba(0,0,0,0.7)"); // Only remove 70%
    grad.addColorStop(1, "rgba(0,0,0,0)");

    bushCtx.fillStyle = grad;
    bushCtx.beginPath();
    bushCtx.arc(mx, my, radius, 0, Math.PI * 2);
    bushCtx.fill();
  }

  // B. REVEAL ANYONE TAKING DAMAGE (User Request: "tout le monde puisse le voir le temps du dégat")
  // We punch a FULL hole or Partial hole for damaged players?
  // "tout le monde puisse le voir" -> implies full visibility.

  // Also clear for Spectator target?
  if (spectatingId.value && !me) {
    const target = players.find((p) => p.id === spectatingId.value);
    if (target) {
      const tx = target.x - cameraX;
      const ty = target.y - cameraY;
      const radius = 320;
      const grad = bushCtx.createRadialGradient(tx, ty, 50, tx, ty, radius);
      grad.addColorStop(0, "rgba(0,0,0,0.7)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      bushCtx.fillStyle = grad;
      bushCtx.beginPath();
      bushCtx.arc(tx, ty, radius, 0, Math.PI * 2);
      bushCtx.fill();
    }
  }

  bushCtx.restore();

  // 4. Draw Offscreen to Main
  // We apply the shake translation if needed?
  // The 'drawBushes' call is inside the main 'ctx.save()' which ALREADY has shake applied.
  // HOWEVER, we drew to bushCanvas using raw screen coordinates (x - cameraX).
  // If we draw bushCanvas at (0,0), it will align perfectly with other things drawn at (x-cameraX).
  // BUT the 'ctx' currently has a translate(shakeX, shakeY).
  // Does our offscreen buffer have shake? No.
  // So:
  // - Main Ctx is shifted by Shake.
  // - Offscreen bushes were drawn relative to Camera (not shook).
  // - If we drawImage(bushCanvas, 0, 0), it will be shifted by Shake again essentially.
  // - Wait. Grid, Walls etc use coordinate "x - cameraX".
  // - Shake adds "translate(sx, sy)". So "x - cameraX + sx".
  // - Our BushCanvas matches "x - cameraX".
  // - So drawImage(bushCanvas, 0,0) inside the shook context -> "0 + sx, 0 + sy".
  // - The pixel at "100" in bushCanvas represents "100 - cameraX".
  // - On screen it lands at "100 + sx".
  // - This is correct.

  ctx.drawImage(bushCanvas, 0, 0);
};

// NEW: Draw Names ON TOP of everything
const drawPlayerNames = (ctx) => {
  const me = players.find((p) => p.id === myId);
  if (!me) return;

  const renderHUD = (p) => {
    const screenX = p.x - cameraX;
    const screenY = p.y - cameraY;

    // OPTIMIZATION: Cull off-screen names (Text is expensive)
    if (
      screenX < -100 ||
      screenX > window.innerWidth + 100 ||
      screenY < -100 ||
      screenY > window.innerHeight + 100
    )
      return;

    // BUSH HIDING LOGIC for Names
    const myBushId = getPlayerBushId(me);
    const targetBushId = getPlayerBushId(p); 

    // VISIBILITY CHECK:
    const dist = Math.hypot(p.x - me.x, p.y - me.y);
    const visionRadius = 320; 

    // Hidden if:
    // - Target is in a bush
    // - AND We are NOT in the same bush
    // - AND Target is OUTSIDE my vision radius
    // - AND Target is not me (or my decoy)

    const inBush = targetBushId !== -1;
    const sameBush = targetBushId === myBushId && myBushId !== -1;
    const inVision = dist < visionRadius;

    // Identify if it's me or my entity
    const isMeOrMine = p.id === myId || p.ownerId === myId;

    // Visuals (Flash)
    let isDamaged = false;
    if (p.id && playerVisuals.value[p.id]) {
        const v = playerVisuals.value[p.id];
        if (v.flashTime > 0) isDamaged = true;
    }
    // Note: Decoys usually don't have 'id' in the same list as players, so no flash logic for now unless added.

    // Logic: Hide if (Bush Logic) OR (Invisible Skill Logic)
    const isInvisibleSkill = p.invisible && !isMeOrMine && !isDamaged;
    
    // Bush Hide: In Bush AND (Not Same Bush) AND (Not In Vision) AND (Not Damaged) AND (Not Me)
    const isHiddenBush = inBush && !sameBush && !inVision && !isDamaged && !isMeOrMine;

    const isHidden = isHiddenBush || isInvisibleSkill;

    if (p.dead || p.hp <= 0) return; // Hide HUD on death
    if (isHidden) return;

    // Username Tag
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 14px "Segoe UI"';
    ctx.textAlign = "center";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    
    // Render Name (or Hero name fallback)
    let name = p.username || p.hero;
    if (typeof name === 'object') name = name.name; // Handle if hero object passed
    ctx.fillText(name || "Unknown", screenX, screenY - 65);

    // CORES DISPLAY
    if (p.powerCores !== undefined) {
      const coreY = screenY - 85;
      ctx.fillStyle = "#00ff00";
      ctx.beginPath();
      ctx.arc(screenX - 10, coreY - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#00ff00";
      ctx.fillText(p.powerCores, screenX + 5, coreY);
    }

    // HP Bar
    const maxHp = p.maxHp || 100;
    const hpPct = Math.max(0, p.hp / maxHp);
    const barW = 100; 
    const barH = 14; 
    const barX = screenX - barW / 2;
    const barY = screenY - 60;

    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = isMeOrMine ? "#00ff00" : "#ff0000"; // Green for Me/My Decoy, Red for Enemy
    ctx.fillRect(barX, barY, barW * hpPct, barH);

    // HP Text
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px 'Segoe UI'";
    ctx.textAlign = "center";
    ctx.fillText(
      `${Math.ceil(p.hp)} / ${Math.ceil(maxHp)}`,
      screenX,
      barY + 11
    );


    // MARKED STATUS
    if (p.isMarked) {
      ctx.fillStyle = "#ff00ff"; // Purple/Magenta
      ctx.font = "bold 16px 'Segoe UI'";
      ctx.fillText("☠ MARKED ☠", screenX, barY - 15);
      
      // Purple Glow Border on Bar
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX - 2, barY - 2, barW + 4, barH + 4);

    }
  });
};

const drawLeaderboard = (ctx) => {
  if (!players || players.length === 0) return;

  const sorted = [...players].sort((a, b) => (b.kills || 0) - (a.kills || 0));
  const top5 = sorted.slice(0, 5);

  const boxW = 200;
  const boxH = 30 + top5.length * 25;
  const startX = window.innerWidth - boxW - 20; // Moved to RIGHT
  const startY = 160; // Below Rank/HUD & Abort Button

  // Bg
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(startX, startY, boxW, boxH);
  ctx.strokeStyle = "#00f3ff";
  ctx.strokeRect(startX, startY, boxW, boxH);

  // Title
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 16px "Segoe UI"';
  ctx.textAlign = "left";
  ctx.fillText("LEADERBOARD", startX + 10, startY + 20);

  // Rows
  ctx.font = '14px "Segoe UI"';
  top5.forEach((p, i) => {
    const y = startY + 45 + i * 25;
    const name = p.username || p.hero;
    const kills = p.kills || 0;

    // Highlight self
    if (p.id === myId) {
      ctx.fillStyle = "#00ff00";
    } else {
      ctx.fillStyle = "#ccc";
    }

    ctx.fillText(`${i + 1}. ${name}`, startX + 10, y);
    ctx.textAlign = "right";
    ctx.fillText(kills, startX + boxW - 10, y);
    ctx.textAlign = "left";
  });
};

const loop = (ctx) => {
  // Update Camera
  let target = players.find((p) => p.id === myId);
  if (!target && spectatingId.value) {
    target = players.find((p) => p.id === spectatingId.value);
  }

  if (target) {
    const targetX = target.x - window.innerWidth / 2;
    const targetY = target.y - window.innerHeight / 2;
    cameraX += (targetX - cameraX) * 0.1;
    cameraY += (targetY - cameraY) * 0.1;
  }

  // UPDATE & CLEAR
  updateParticles();

  // Update Shake
  if (shakeDuration > 0) {
    shakeDuration--;
    shakeX = (Math.random() - 0.5) * shakeIntensity;
    shakeY = (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9; // Decay
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  ctx.fillStyle = "#050510";
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // FLASH OVERLAY (Decay)
  if (flashAlpha > 0) {
    flashAlpha -= 0.02;
    if (flashAlpha < 0) flashAlpha = 0;
  }

  ctx.save();
  if (shakeDuration > 0) {
    ctx.translate(shakeX, shakeY);
  }

  // 1. Grid & Floor
  drawGrid(ctx);

  // 2. Floor Decoration (Crates, Items) - UNDER Players
  drawFloorDeco(ctx);

  // 3. Projectiles MOVED AFTER BUSHES for visibility
  // drawProjectiles(ctx); MOVED

  // 4. Entities (Mines, Decoys) - BACKGROUND LAYER
  entities.forEach((ent) => {
    if (ent.type === "MINE") {
      const sx = ent.x - cameraX;
      const sy = ent.y - cameraY;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#ff3300";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 12 + Math.sin(Date.now() / 200) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff3300";
      ctx.stroke();
    } else if (ent.type === "WALL_TEMP") {
      const sx = ent.x - cameraX;
      const sy = ent.y - cameraY;

      ctx.save();
      // If angle is provided, rotate around center
      if (typeof ent.angle === "number") {
        const cx = sx + ent.w / 2;
        const cy = sy + ent.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(ent.angle);
        // If we have base dimensions (visual size), use them centered
        // Otherwise use the collision box (ent.w/h) centered
        const vw = ent.baseW || ent.w;
        const vh = ent.baseH || ent.h;
        ctx.fillStyle = "rgba(0, 243, 255, 0.3)";
        ctx.fillRect(-vw / 2, -vh / 2, vw, vh);
        ctx.strokeStyle = "#00f3ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(-vw / 2, -vh / 2, vw, vh);
      } else {
        // Fallback for non-rotated
        ctx.fillStyle = "rgba(0, 243, 255, 0.3)";
        ctx.fillRect(sx, sy, ent.w, ent.h);
        ctx.strokeStyle = "#00f3ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, ent.w, ent.h);
      }
      ctx.restore();
    } else if (ent.type === "DECOY") {
      // Draw Decoy (REALISTIC: Identical to real player)
      ctx.save();
      // ctx.globalAlpha = 1.0; // Default opacity for realism
      // Reuse drawPlayer logic
      const fakePlayer = {
        ...ent,
        id: ent.ownerId || "decoy", // Pass ID for potential logic (but not invisibility)
        angle: Math.atan2(ent.vy, ent.vx), // Face movement direction
        hero: ent.heroName,
        heroClass: ent.heroClass,
        shield: false,
        dead: false,
      };
      drawPlayer(ctx, fakePlayer);
      ctx.restore();
    }
  });

  // 5. Players
  players.forEach((p) => {
    // Inject Flash Time for drawPlayer (visual glow)
    const visuals = playerVisuals.value[p.id];
    if (visuals && visuals.flashTime > 0) {
      p.flashTime = visuals.flashTime; // Pass to drawPlayer
      visuals.flashTime--; // Decay
    }

    drawPlayer(ctx, p);
  });

  // 6. DRAW BUSHES (Over Players, Hiding them)
  drawBushes(ctx);

  // 7. PROJECTILES (Over Bushes - User Request: "voir mes balles traverse")
  drawProjectiles(ctx);

  // 7.5. EXPOSED PLAYERS (Draw ON TOP of bushes if damaged)
  // User Request: "pas que sa fasse un trou... qui se mette devant le buisson"
  players.forEach((p) => {
    const visuals = playerVisuals.value[p.id];
    if (visuals && visuals.flashTime > 0) {
      // If damaged, we draw them again here so they appear ON TOP of the bush
      drawPlayer(ctx, p);
    }
  });

  // 8. DRAW WALLS (Over Bushes, Occluding them)
  drawWalls(ctx);

  // 8.5. PHASING PLAYERS (Ghost/Spectre Capability)
  // Draw them *over* walls if they are using their ability.
  players.forEach((p) => {
    // Check for Ghost phasing or generic "Skill Active" state (if used for visual override)
    if (p.isPhasing || p.isSkillActive) {
      // Redraw player to appear above the wall.
      // Optional: Add some transparency to show "ghostly" nature?
      ctx.save();
      ctx.globalAlpha = 0.8;
      drawPlayer(ctx, p);
      ctx.restore();
    }
  });

  // 8. PARTICLES & VFX (Over Everything usually)
  drawParticles(ctx);
  drawShockwaves(ctx);

  // 9. PLAYER NAMES & HUD (ABSOLUTE TOP LAYER)
  drawPlayerNames(ctx);

  // 10. ZONE OVERLAY
  drawZone(ctx);

  ctx.restore(); // End Context Save (Shake)

  // DRAW FLASH OVERLAY (Post-Shake)
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  }

  // Draw UI Layers
  drawLeaderboard(ctx);

  animationId = requestAnimationFrame(() => loop(ctx));
};

if (canvasRef.value) {
  const ctx = canvasRef.value.getContext("2d");
  loop(ctx);
}
</script>

<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas"></canvas>

    <!-- QUEUE OVERLAY (Matchmaking) -->
    <div v-if="inQueue" class="queue-overlay">
      <div class="radar-container">
        <div class="radar-sweep"></div>
        <div class="radar-grid"></div>
      </div>

      <div class="mm-content">
        <h1 class="glitch-text">SEARCHING FOR AGENTS</h1>

        <div class="mm-stats">
          <div class="stat-row">
            <span class="label">OPERATIVES FOUND:</span>
            <span class="value">{{ queueCount }} / {{ queueMax }}</span>
          </div>
          <div class="stat-row">
            <span class="label">STATUS:</span>
            <span class="value status-blink">{{
              customStatus || "SCANNING REGION..."
            }}</span>
          </div>
        </div>

        <div class="mm-tips">
          <span class="tip-label">TIP:</span>
          <span class="tip-text"
            >Destroy crates to gather Power Cores and increase HP.</span
          >
        </div>

        <button
          class="btn-quit"
          style="margin-top: 20px"
          @click="router.push('/dashboard')"
        >
          CANCEL SEARCH
        </button>
      </div>

      <!-- RIGHT SIDE PLAYER LIST -->
      <div class="mm-player-list">
        <h3>SQUAD LIST</h3>
        <div class="player-list-scroll">
          <div v-for="player in queuePlayers" :key="player" class="player-entry">
             <span class="p-icon">👤</span> {{ player }}
          </div>
          <div v-if="queuePlayers.length === 0" class="empty-list">
            Scanning...
          </div>
        </div>
      </div>
    </div>

    <!-- BR HUD -->
    <div v-if="aliveCount > 0" class="br-hud-top-right">
      <div class="alive-counter">
        <span class="label">ALIVE</span>
        <span class="value">{{ aliveCount }}</span>
      </div>
    </div>

    <!-- Kill Feed -->
    <div class="kill-feed">
      <div v-for="msg in killMessages" :key="msg.id" class="kill-msg">
        {{ msg.text }}
      </div>
    </div>

    <!-- TOP RIGHT RANK (User Request) -->
    <div
      class="top-right-rank-hud"
      v-if="!inQueue && !isDead && route.query.mode === 'battle_royale'"
    >
      <div class="rank-display-hud">TOP {{ aliveCount }}</div>
      <div class="rank-label">SURVIVORS</div>
    </div>

    <!-- Respawn Overlay -->

    <!-- GAME COUNTDOWN -->
    <div v-if="showCountdown" class="countdown-overlay">
      <div class="countdown-text">{{ countdownVal }}</div>
      <div class="countdown-sub">PREPARE FOR BATTLE</div>
    </div>

    <!-- WIN SCREEN -->
    <div v-if="isWinner" class="win-screen">
      <div class="trophy-icon">🏆</div>
      <h1>VICTORY ROYAL</h1>
      <h2>CHAMPION OF THE ARENA</h2>
      <div class="win-stats">
        <div class="stat">
          <span class="label">ELIMINATIONS</span>
          <span class="val">{{
            killMessages.filter((m) => m.text.includes("YOU")).length
          }}</span>
        </div>
        <div class="stat">
          <span class="label">CORES</span>
          <span class="val">{{ powerCores }}</span>
        </div>
        <div class="stat" v-if="earnedCoins > 0">
          <span class="label">REWARD</span>
          <span
            class="val"
            style="color: #ffd700; text-shadow: 0 0 10px #ffd700"
            >+{{ earnedCoins }}</span
          >
        </div>
      </div>
      <button class="btn btn-primary" @click="router.push('/dashboard')">
        RETURN TO BASE
      </button>
    </div>

    <!-- DEATH SCREEN / SPECTATOR -->
    <div
      class="respawn-overlay death-anim"
      v-if="isDead && !isWinner && !hideDeathOverlay"
    >
      <div class="death-card">
        <h1 class="glitch-text">
          {{ route.query.mode === "battle_royale" ? "ELIMINATED" : "YOU DIED" }}
        </h1>

        <!-- Stats Container -->
        <div class="death-stats">
          <!-- Killer Info (All Modes) -->
          <div v-if="killedBy" class="killer-section">
            <span class="label">ELIMINATED BY</span>
            <span class="killer-name">{{ killedBy }}</span>
            <span class="killer-hero" v-if="killedByHero">{{
              killedByHero
            }}</span>
          </div>

          <!-- BR Rank Info -->
          <div v-if="route.query.mode === 'battle_royale'" class="rank-section">
            <div class="rank-display">
              <span class="rank-hash">#</span>{{ myRank }}
              <span class="rank-total">/ {{ queueMax }}</span>
            </div>
            <div
              class="coin-reward"
              v-if="earnedCoins > 0"
              style="
                margin-top: 15px;
                color: #ffd700;
                font-size: 1.5rem;
                font-weight: bold;
                text-shadow: 0 0 10px #ffd700;
              "
            >
              +{{ earnedCoins }} COINS
            </div>
          </div>

          <div
            v-if="route.query.mode !== 'battle_royale'"
            class="arena-respawn-box"
          >
            <div class="respawn-timer">{{ respawnTimer }}</div>
            <p>RESPAWNING...</p>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="death-actions">
          <button
            class="btn btn-spectate"
            @click="joinMatch"
            v-if="route.query.mode === 'battle_royale'"
          >
            PLAY AGAIN
          </button>
          <button
            class="btn btn-outline"
            @click="hideDeathOverlay = true"
            v-if="route.query.mode === 'battle_royale'"
          >
            SPECTATE
          </button>
          <button class="btn btn-return" @click="router.push('/dashboard')">
            RETURN TO BASE
          </button>
        </div>
      </div>
    </div>

    <!-- SPECTATING HUD (Mini Overlay) -->
    <div class="spectating-hud" v-if="isDead && hideDeathOverlay">
      <div class="spec-banner">
        SPECTATING
        <span style="color: #00f3ff; margin-left: 10px">{{
          spectatingId === myId
            ? "..."
            : players.find((p) => p.id === spectatingId)?.username || "UNKNOWN"
        }}</span>
      </div>
      <button class="btn btn-sm btn-danger" @click="router.push('/dashboard')">
        LEAVE MATCH
      </button>
    </div>

    <div class="hud" v-if="!isDead">
      <div class="hud-panel left">
        <h3>HERO: {{ gameStore.selectedHero?.name || "UNKNOWN" }}</h3>
      </div>
      <div class="hud-panel center">
        <h2>NEON ARENA</h2>
      </div>

      <!-- Skill HUD (Clickable on Mobile) -->
      <div
        class="hud-skill"
        v-if="!isMobile"
        @click="triggerSkill"
        @touchstart.prevent="triggerSkill"
      >
        <div
          class="skill-box"
          :class="{
            'active-box': skillCD > maxSkillCD,
            disabled: skillCD > 0 && skillCD <= maxSkillCD,
            'mobile-skill': isMobile,
          }"
        >
          <span class="key-hint">E</span>
          <div class="skill-icon" v-if="skillCD <= 0">SKILL</div>
          <div
            class="cooldown-overlay"
            :class="{ active: skillCD > maxSkillCD }"
            :style="{
              height: Math.min((skillCD / maxSkillCD) * 100, 100) + '%',
            }"
          ></div>

          <!-- BUSY / INFINITE -->
          <div
            class="cooldown-text"
            v-if="skillCD >= 50000"
            style="font-size: 2rem; margin-top: -5px"
          >
            ⌛
          </div>
          <!-- OVERLOAD / PENALTY -->
          <div
            class="cooldown-text active-text"
            v-else-if="skillCD > maxSkillCD"
          >
            {{ ((skillCD - maxSkillCD) / 1000).toFixed(1) }}s
          </div>
          <!-- NORMAL COOLDOWN -->
          <div class="cooldown-text" v-else-if="skillCD > 0">
            {{ (skillCD / 1000).toFixed(1) }}
          </div>
        </div>
      </div>

      <div class="hud-panel right">
        <button
          @click="router.push('/dashboard')"
          class="btn-quit"
          v-if="route.query.mode !== 'battle_royale'"
        >
          ABORT MISSION
        </button>
      </div>
    </div>

    <div class="controls-hint" v-if="!isMobile">
      WASD: Move | MOUSE: Aim | Space: Shoot
    </div>

    <!-- Mobile Controls Containers -->
    <div v-if="isMobile" id="zone-joystick-left" class="joy-zone"></div>
    <div v-if="isMobile" id="zone-joystick-right" class="joy-zone"></div>

    <!-- Mobile Action Buttons -->
    <div v-if="isMobile" class="mobile-actions">
      <div class="skill-btn-wrapper">
        <button
          class="btn-skill-mobile"
          :class="{ ready: skillCD <= 0, cooldown: skillCD > 0 }"
          @touchstart.prevent="triggerSkill"
          @mousedown.prevent="triggerSkill"
        >
          <span v-if="skillCD > 0 && skillCD < 50000">{{
            (skillCD / 1000).toFixed(0)
          }}</span>
          <span v-else-if="skillCD >= 50000" style="font-size: 1.5rem">⌛</span>
          <span v-else style="font-size: 1.5rem">⚡</span>
        </button>
      </div>

      <!-- Shoot Button (Large, near right stick) -->
      <button
        class="btn-fire"
        @touchstart.prevent="startShooting"
        @touchend.prevent="stopShooting"
        @mousedown.prevent="startShooting"
        @mouseup.prevent="stopShooting"
      >
        FIRE
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #000;
  overflow: hidden;
}

.kill-feed {
  position: absolute;
  bottom: 180px; /* Above Skill Button (which is ~80px-150px) */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse; /* Stack upwards from bottom */
  align-items: center;
  pointer-events: none;
  z-index: 500;
}

.kill-msg {
  color: #ff0033;
  font-family: "Segoe UI", sans-serif;
  font-size: 14px; /* Much smaller */
  font-weight: 800;
  text-transform: uppercase;
  text-shadow: 0 0 5px rgba(255, 0, 0, 0.8);
  margin-bottom: 2px;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.game-canvas {
  display: block;
}

.hud {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 80px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 2rem;
  pointer-events: none; /* Let clicks pass through to canvas */
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent);
}

.hud-panel {
  pointer-events: auto;
}

.hud-panel h2 {
  color: var(--primary);
  text-shadow: 0 0 10px var(--primary);
  font-size: 2rem;
  letter-spacing: 5px;
}

.hud-panel h3 {
  color: #fff;
  font-size: 1.2rem;
}

.btn-quit {
  background: rgba(255, 0, 50, 0.2);
  border: 1px solid #ff3333;
  color: #ff3333;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.btn-quit:hover {
  background: #ff3333;
  color: white;
}

.controls-hint {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9rem;
  letter-spacing: 2px;
  pointer-events: none;
}

.hud-skill {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: auto;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.respawn-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(20, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 999;
  animation: fadeIn 0.5s;
}

.respawn-overlay h1 {
  color: #ff0033;
  font-size: 5rem;
  letter-spacing: 10px;
  text-shadow: 0 0 20px #ff0033;
  margin-bottom: 2rem;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}

.respawn-timer {
  font-size: 6rem;
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 10px #fff;
}

.respawn-overlay p {
  color: #aaa;
  font-size: 1.5rem;
  letter-spacing: 5px;
  margin-top: 1rem;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.skill-box {
  width: 70px;
  height: 70px;
  background: rgba(10, 10, 20, 0.85); /* Darker, more solid background */
  border: 2px solid #00f3ff;
  border-radius: 12px; /* Smoother corners */
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.4),
    inset 0 0 10px rgba(0, 243, 255, 0.1);
  transition: all 0.2s ease;
}

.skill-box.disabled {
  border-color: #ff3333; /* Red when on cooldown */
  box-shadow: 0 0 10px rgba(255, 51, 51, 0.3);
  background: rgba(20, 0, 0, 0.8);
}

.skill-box.active-box {
  border-color: #ffea00; /* Yellow when Active */
  box-shadow: 0 0 15px rgba(255, 230, 0, 0.6);
  background: rgba(40, 40, 0, 0.8);
}

.key-hint {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 800;
  text-shadow: 0 0 2px #000;
  z-index: 102;
}

.skill-icon {
  font-size: 12px;
  color: #00f3ff;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 0 5px #00f3ff;
  z-index: 102;
}

.skill-box.disabled .skill-icon {
  color: #ff5555;
  text-shadow: 0 0 5px #ff0000;
}

.cooldown-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(255, 50, 50, 0.3); /* Reddish tint overlay */
  transition: height 0.05s linear;
  z-index: 100;
}

.cooldown-overlay.active {
  background: rgba(255, 230, 0, 0.5); /* Yellow/Gold for Active */
  box-shadow: 0 0 10px rgba(255, 230, 0, 0.5);
}

.cooldown-text {
  position: absolute;
  font-size: 20px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 4px #000;
  z-index: 103;
}

.active-text {
  color: #ffea00;
  text-shadow: 0 0 5px #ffea00;
  font-size: 22px; /* Slightly bigger */
}

/* Mobile Controls CSS */
.joy-zone {
  position: absolute;
  bottom: 0px;
  width: 50%;
  height: 200px;
  height: 200px;
  z-index: 200;
  /* border: 1px solid green; Debug */
}
#zone-joystick-left {
  left: 0;
}
#zone-joystick-right {
  right: 0;
}

.mobile-actions {
  position: absolute;
  bottom: 140px;
  right: 30px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 50px;
}

.btn-fire {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 0, 0, 0.5);
  border: 3px solid #ff3333;
  color: #fff;
  font-weight: bold;
  font-size: 1.2rem;
  box-shadow: 0 0 15px #ff3333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-fire:active {
  background: #ff3333;
  transform: scale(0.95);
}

.btn-skill-mobile {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid #00f3ff;
  color: #00f3ff;
  font-weight: bold;
  font-size: 1.2rem;
  box-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-skill-mobile.ready {
  background: rgba(0, 243, 255, 0.2);
  box-shadow: 0 0 15px #00f3ff;
}

.btn-skill-mobile.cooldown {
  border-color: #555;
  color: #aaa;
  box-shadow: none;
}

.btn-skill-mobile:active {
  transform: scale(0.95);
  background: #00f3ff;
  color: #000;
}

.mobile-skill {
  /* Make the skill button pop more on mobile */
  transform: scale(1.2);
  border-color: #00f3ff;
  box-shadow: 0 0 25px rgba(0, 243, 255, 0.6);
}

@media (max-width: 768px) {
  .hud {
    padding: 0 1rem;
    height: 60px;
    background: rgba(0, 0, 0, 0.6);
  }

  .hud-panel h2 {
    font-size: 1.2rem;
    letter-spacing: 2px;
  }

  .hud-panel h3 {
    font-size: 0.8rem;
  }

  .btn-quit {
    padding: 0.3rem 0.6rem;
    font-size: 0.7rem;
  }

  .skill-box {
    width: 60px;
    height: 60px;
    bottom: 20px; /* Move up a bit */
  }

  .controls-hint {
    display: none; /* Hide keyboard hints on mobile */
  }
}
.queue-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 100;
  color: #fff;
}
.queue-title {
  font-size: 3rem;
  letter-spacing: 5px;
  color: #00f3ff;
  text-shadow: 0 0 20px #00f3ff;
}
.queue-count {
  font-size: 2rem;
  margin: 1rem 0;
  font-weight: bold;
}
.queue-status {
  color: #888;
  letter-spacing: 2px;
}

.br-hud {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2rem;
  z-index: 50;
}
.alive-counter,
.gems-counter {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #00f3ff;
  padding: 0.5rem 1.5rem;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.alive-counter .value,
.gems-counter .value {
  font-size: 2rem;
  font-weight: bold;
  color: #00f3ff;
}
.alive-counter .label,
.gems-counter .label {
  font-size: 0.8rem;
  color: #aaa;
}
.gems-counter .value {
  color: #00ff00;
}
.gems-counter {
  border-color: #00ff00;
}
.countdown-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
  z-index: 200;
}
.countdown-text {
  font-size: 10rem;
  color: #fff;
  font-weight: 900;
  text-shadow: 0 0 50px #00f3ff;
  animation: pulse 1s infinite;
}
.countdown-sub {
  color: #00f3ff;
  letter-spacing: 10px;
  font-size: 2rem;
  margin-top: -20px;
}

.win-screen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 300;
  color: #ffd700;
}
.trophy-icon {
  font-size: 8rem;
  margin-bottom: 1rem;
  filter: drop-shadow(0 0 30px gold);
  animation: float 3s infinite ease-in-out;
}
.win-screen h1 {
  font-size: 5rem;
  text-shadow: 0 0 20px gold;
  margin: 0;
}
.win-screen h2 {
  color: #fff;
  font-size: 1.5rem;
  letter-spacing: 5px;
  margin-bottom: 3rem;
}
.win-stats {
  display: flex;
  gap: 3rem;
  margin-bottom: 3rem;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat .label {
  color: #888;
  font-size: 0.8rem;
}
.stat .val {
  color: #fff;
  font-size: 2rem;
  font-weight: bold;
}

.spectating-text {
  color: #fff;
  letter-spacing: 2px;
  margin-bottom: 1rem;
  animation: pulse 2s infinite;
}
.arena-death-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
}

/* TOP RIGHT HUD */
.top-right-rank-hud {
  position: absolute;
  top: 90px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* Align right */
  z-index: 100;
  pointer-events: none;
}

.rank-display-hud {
  font-size: 3rem;
  font-weight: 900;
  color: #ffd700;
  text-shadow: 0 0 10px #ffd700;
  line-height: 1;
}

.rank-label {
  font-size: 1rem;
  color: #fff;
  letter-spacing: 2px;
  margin-right: 5px; /* Right margin for alignment */
}

/* DEATH CARD UI */
.death-card {
  background: rgba(10, 10, 20, 0.9);
  border: 2px solid #ff3333;
  border-radius: 20px;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 0 50px rgba(255, 0, 0, 0.2);
  min-width: 400px;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.killer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}

.killer-name {
  font-size: 2rem;
  font-weight: 900;
  color: #ff3333;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
}

.killer-hero {
  font-size: 1rem;
  color: #00f3ff;
  letter-spacing: 2px;
}

.death-stats {
  width: 100%; /* Ensure full width for inner centering */
  display: flex;
  flex-direction: column;
  align-items: center; /* Center children */
}

.rank-section {
  width: 100%; /* Full width to allow rank-display centering */
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rank-display {
  font-size: 4rem; /* Bigger for emphasis */
  font-weight: 900;
  color: #ffd700; /* Gold */
  margin: 20px 0;
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  display: flex; /* Flexbox for centering */
  justify-content: center; /* Center horizontally */
  align-items: center; /* Center vertically */
  width: 100%; /* Full width */
  gap: 15px; /* Spacing between #, Rank, Total */
  text-align: center;
}

.rank-hash {
  font-size: 2rem;
  color: #888;
}

.rank-total {
  font-size: 1.5rem;
  color: #666;
}

.death-actions {
  display: flex;
  gap: 20px;
  margin-top: 20px;
  width: 100%;
  justify-content: center;
}

.btn-spectate,
.btn-return {
  padding: 15px 30px;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 1rem;
  text-transform: uppercase;
}

.btn-spectate {
  background: transparent;
  border: 2px solid #00f3ff;
  color: #00f3ff;
}

.btn-spectate:hover {
  background: rgba(0, 243, 255, 0.1);
  box-shadow: 0 0 15px #00f3ff;
}

.btn-return {
  background: #ff3333;
  border: 2px solid #ff3333;
  color: #fff;
}

/* MATCHMAKING UI */
.radar-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  height: 600px;
  border: 2px solid rgba(0, 243, 255, 0.2);
  border-radius: 50%;
  pointer-events: none;
  z-index: 90;
}

.radar-grid {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(
      circle,
      transparent 60%,
      rgba(0, 243, 255, 0.1) 60%,
      rgba(0, 243, 255, 0.1) 61%,
      transparent 61%
    ),
    linear-gradient(rgba(0, 243, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 243, 255, 0.1) 1px, transparent 1px);
  background-size: 100% 100%, 50px 50px, 50px 50px;
}

.radar-sweep {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(0, 243, 255, 0.4) 30deg,
    transparent 30deg
  );
  animation: radarSpin 4s linear infinite;
}

@keyframes radarSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mm-content {
  z-index: 101;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.85); /* Darker backdrop for text */
  padding: 40px;
  border: 1px solid #00f3ff;
  box-shadow: 0 0 30px rgba(0, 243, 255, 0.2);
  border-radius: 10px;
}

.mm-stats {
  margin-top: 20px;
  width: 100%;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  width: 300px;
  margin-bottom: 10px;
  font-size: 1.2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 5px;
}

.stat-row .label {
  color: #888;
}

.stat-row .value {
  color: #00f3ff;
  font-weight: bold;
}

.status-blink {
  animation: blink 1s infinite;
}

@keyframes blink {
  50% {
    opacity: 0.5;
  }
}

.mm-tips {
  margin-top: 30px;
  font-size: 1rem;
  color: #ccc;
  font-style: italic;
  max-width: 400px;
  text-align: center;
}

.tip-label {
  color: #ffd700;
  font-weight: bold;
  margin-right: 5px;
}

/* PLAYER LIST RIGHT SIDE */
.mm-player-list {
  position: absolute;
  right: 50px;
  top: 50%;
  transform: translateY(-50%);
  width: 250px;
  height: 400px;
  background: rgba(0, 0, 20, 0.9);
  border: 1px solid #00f3ff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  z-index: 102;
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.1);
}

.mm-player-list h3 {
  color: #00f3ff;
  border-bottom: 1px solid rgba(0, 243, 255, 0.3);
  padding-bottom: 10px;
  margin-bottom: 15px;
  text-align: center;
  letter-spacing: 2px;
}

.player-list-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-entry {
  color: #fff;
  font-size: 1.1rem;
  padding: 5px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.p-icon {
  font-size: 0.9rem;
  opacity: 0.7;
}

.empty-list {
  color: #666;
  font-style: italic;
  text-align: center;
  margin-top: 50px;
}

.arena-respawn-box {
  width: 100%;
  display: flex !important;
  flex-direction: column;
  align-items: center !important;
  justify-content: center !important;
  margin: 15px 0;
  text-align: center;
}

.respawn-timer {
  font-size: 5rem;
  color: #fff;
  font-weight: bold;
  text-shadow: 0 0 10px #fff;
  margin-bottom: 10px;
  line-height: 1;
  text-align: center;
  width: 100%;
  display: block;
}
</style>
