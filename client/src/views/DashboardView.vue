<script setup>
import { onMounted, ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { useGameStore } from "../stores/game";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const game = useGameStore();
const router = useRouter();
const selectedMode = ref("arena");

onMounted(async () => {
  const success = await auth.fetchProfile();
  if (success) {
    await game.fetchHeroes();
  }
});

const isOwned = (heroId) => {
  return auth.user?.unlockedHeroes?.includes(heroId);
};

const handleSelect = (heroId) => {
  game.selectHero(heroId);
};

const handleBuy = async (heroId) => {
  await game.buyHero(heroId);
};

const startGame = () => {
  if (game.selectedHeroId) {
    router.push({ path: "/play", query: { mode: selectedMode.value } });
  }
};

const logout = () => {
  auth.logout();
};

const getHeroDesc = (name) => {
  const descs = {
    // Tanks
    Vanguard: "ABILITY: Reflector Shield (Invulnerable 3s)",
    Titan: "ABILITY: Juggernaut (+HP, -Speed)",
    Brawler: "ABILITY: Berserker (Rapid Fire, +Speed)",
    Goliath: "ABILITY: Fortress (Rooted, Heal, Invulnerable)",

    // Speed
    Spectre: "ABILITY: Blink (Teleport)",
    Volt: "ABILITY: Overload (Super Speed)",
    Ghost: "ABILITY: Phasing (Walk through walls)",

    // Support
    Techno: "ABILITY: Proximity Mine",
    Engineer: "ABILITY: Force Field (Block shots)",
    Medic: "ABILITY: Regenerator (Area Heal)",

    // Damage
    Blaze: "ABILITY: Rapid Fire",
    Frost: "ABILITY: Freeze Shot (Freezes Enemy)",
    Sniper: "ABILITY: Railgun (High Dmg, Fast Shot)",
    Shadow: "ABILITY: Stealth (Invisible 5s)",
    Nova: "ABILITY: Nova Blast (Radial Attack)",
  };
  return descs[name] || "ABILITY: Classifier Error";
};
const retryConnection = async () => {
  const success = await auth.fetchProfile();
  if (success) {
    await game.fetchHeroes();
  }
};
</script>

<template>
  <div class="dashboard-page">
    <!-- BACKGROUND LOGO WATERMARKS -->
    <div class="bg-watermark right"></div>
    <div class="bg-watermark left"></div>

    <header class="top-bar">
      <div class="user-info">
        <span class="neon-text">OPERATIVE: {{ auth.user?.username }}</span>
        <span class="coins">CREDITS: {{ auth.user?.coins }}</span>
      </div>
      <button @click="logout" class="btn btn-secondary">LOGOUT</button>
    </header>

    <div class="container">
      <div v-if="auth.error" class="error-banner">
        CONNECTION ERROR: {{ auth.error }}
        <button @click="retryConnection" class="btn btn-sm">RETRY</button>
      </div>

      <div v-if="!auth.user && !auth.error" class="loading-state">
        ESTABLISHING UPLINK...
      </div>

      <div v-else-if="auth.user" class="dashboard-content">
        <h2 class="section-title glitch-effect" data-text="CHOOSE YOUR AVATAR">
          CHOOSE YOUR AVATAR
        </h2>
        <div class="main-panel">
          <!-- Hero Card -->
          <div class="hero-display-card">
            <div class="scan-line"></div>
            <div v-if="game.selectedHero" class="hero-info">
              <div class="cyber-header">OPERATING AS:</div>
              <h1 class="hero-name">{{ game.selectedHero.name }}</h1>
              <div class="hero-class-badge">
                {{ game.selectedHero.class }} CLASS
              </div>

              <div class="stats-box">
                <div class="stat-row">
                  <span class="label">ABILITY PROTOCOL:</span>
                  <span class="value">{{
                    getHeroDesc(game.selectedHero.name).replace("ABILITY: ", "")
                  }}</span>
                </div>
              </div>

              <button
                @click="router.push('/heroes')"
                class="btn btn-secondary change-btn"
              >
                CYBERNETICS // LOADOUT
              </button>
            </div>
            <div v-else class="no-hero">
              <p>NO OPERATIVE SELECTED</p>
              <button @click="router.push('/heroes')" class="btn btn-primary">
                SELECT HERO
              </button>
            </div>
          </div>

          <!-- Mode Selection -->
          <div class="mode-selector">
            <button
              class="mode-btn"
              :class="{ active: selectedMode === 'arena' }"
              @click="selectedMode = 'arena'"
            >
              ARENA
              <span class="sub">FFA DEATHMATCH</span>
            </button>
            <button
              class="mode-btn"
              :class="{ active: selectedMode === 'battle_royale' }"
              @click="selectedMode = 'battle_royale'"
            >
              BATTLE ROYALE
              <span class="sub">14-PLAYER SURVIVAL</span>
            </button>
          </div>

          <!-- Action Buttons -->
          <div class="action-dock">
            <button
              @click="router.push('/leaderboard')"
              class="btn btn-outline rank-btn"
            >
              <span class="icon">🏆</span> GLOBAL RANKINGS
            </button>

            <button
              @click="startGame"
              class="btn btn-primary start-btn neon-pulse"
              :disabled="!game.selectedHeroId"
            >
              INITIALIZE DROP
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Page Layout & Background */
.dashboard-page {
  min-height: 100vh;
  background-color: #050505;
  background-image: linear-gradient(
      rgba(0, 255, 255, 0.03) 1px,
      transparent 1px
    ),
    linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
  color: #fff;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* scanline info */
.dashboard-page::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at center, transparent 0%, #000 90%);
  pointer-events: none;
  pointer-events: none;
  z-index: 1;
}

.bg-watermark {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 80vh; /* Responsive large size */
  height: 80vh;
  background-image: url("/logo_icon-removebg.png");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.15; /* Subtle styling */
  z-index: 0; /* Behind everything */
  pointer-events: none;
  filter: drop-shadow(0 0 50px rgba(0, 255, 255, 0.2));
  animation: pulse-logo 10s ease-in-out infinite;
}

.bg-watermark.right {
  left: 85%;
}

.bg-watermark.left {
  left: 15%;
}

@keyframes pulse-logo {
  0%,
  100% {
    opacity: 0.15;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 0.25;
    transform: translate(-50%, -50%) scale(1.05);
  }
}

.container {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Top Bar */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 3rem;
  background: rgba(0, 0, 0, 0.8);
  border-bottom: 2px solid var(--primary-dim);
  backdrop-filter: blur(10px);
  z-index: 10;
}

.user-info {
  display: flex;
  gap: 3rem;
  font-size: 1.1rem;
  letter-spacing: 1px;
}

.user-info .neon-text {
  color: #fff;
  text-shadow: 0 0 5px var(--primary);
}

.coins {
  color: #ffd700;
  text-shadow: 0 0 5px #ffd700;
}

/* Main Content */
.section-title {
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: 6px;
  margin-bottom: 0rem;
  color: #fff;
  text-transform: uppercase;
  text-shadow: 2px 2px 0px var(--primary-dim);
}

.game-logo {
  width: 180px;
  height: auto;
  margin-bottom: 2rem;
  mix-blend-mode: screen; /* Removes black background */
  filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.5));
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.main-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3rem;
  width: 100%;
  max-width: 600px;
}

/* Hero Display Card */
.hero-display-card {
  position: relative;
  background: rgba(10, 15, 20, 0.9);
  border: 1px solid var(--primary);
  width: 100%;
  padding: 3rem;
  text-align: center;
  box-shadow: 0 0 30px rgba(0, 243, 255, 0.15),
    inset 0 0 50px rgba(0, 0, 0, 0.8);
  clip-path: polygon(
    20px 0,
    100% 0,
    100% calc(100% - 20px),
    calc(100% - 20px) 100%,
    0 100%,
    0 20px
  );
  overflow: hidden;
}

.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 5px;
  background: rgba(0, 255, 255, 0.5);
  box-shadow: 0 0 10px cyan;
  animation: scan 3s linear infinite;
  opacity: 0.3;
}

@keyframes scan {
  0% {
    top: 0%;
    opacity: 0;
  }
  10% {
    opacity: 0.5;
  }
  90% {
    opacity: 0.5;
  }
  100% {
    top: 100%;
    opacity: 0;
  }
}

.cyber-header {
  color: #666;
  font-size: 0.9rem;
  letter-spacing: 2px;
  margin-bottom: 1rem;
}

.hero-name {
  font-size: 4rem;
  margin: 0;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 10px var(--primary), 0 0 20px var(--primary);
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.hero-class-badge {
  display: inline-block;
  background: var(--primary-dim);
  color: var(--primary);
  padding: 0.25rem 1rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 2rem;
  border: 1px solid var(--primary);
}

.stats-box {
  background: rgba(0, 0, 0, 0.5);
  padding: 1rem;
  border-left: 3px solid var(--primary);
  margin-bottom: 2rem;
  text-align: left;
}

.stat-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  color: #888;
  font-size: 0.8rem;
  letter-spacing: 1px;
}

.value {
  color: #fff;
  font-size: 1.2rem;
  text-shadow: 0 0 5px cyan;
}

/* Buttons */
.change-btn {
  width: 100%;
  font-size: 1rem;
  letter-spacing: 2px;
  padding: 1rem;
  background: transparent;
  border: 1px solid #444;
  color: #888;
  transition: all 0.3s;
}

.change-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(0, 243, 255, 0.05);
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
}

/* Action Dock */
.action-dock {
  display: flex;
  gap: 2rem;
  width: 100%;
}

.rank-btn {
  flex: 1;
  background: transparent;
  border: 1px solid #444;
  color: #aaa;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s;
}

.rank-btn:hover {
  border-color: #ffd700;
  color: #ffd700;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
}

.start-btn {
  flex: 2;
  font-size: 1.8rem;
  padding: 1.5rem;
  font-weight: bold;
  letter-spacing: 4px;
  background: var(--primary);
  color: #000;
  border: none;
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
  cursor: pointer;
  transition: all 0.3s;
}

.start-btn:disabled {
  filter: grayscale(1);
  opacity: 0.5;
  cursor: not-allowed;
}

.neon-pulse {
  animation: neon-pulse 2s infinite;
}

@keyframes neon-pulse {
  0% {
    box-shadow: 0 0 10px var(--primary);
  }
  50% {
    box-shadow: 0 0 30px var(--primary), 0 0 50px var(--primary);
  }
  100% {
    box-shadow: 0 0 10px var(--primary);
  }
}

.msg-box {
  background: rgba(255, 0, 0, 0.2);
  border: 1px solid red;
  color: #ff5555;
  padding: 1rem;
  margin-bottom: 1rem;
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .dashboard-page {
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
  }

  .top-bar {
    padding: 1rem;
    flex-direction: column;
    gap: 1rem;
  }

  .user-info {
    font-size: 0.9rem;
    gap: 1rem;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .section-title {
    font-size: 1.8rem;
    letter-spacing: 2px;
    text-align: center;
  }

  .main-panel {
    gap: 1.5rem;
  }

  .hero-display-card {
    padding: 1.5rem;
    width: 95%;
  }

  .hero-name {
    font-size: 2.2rem;
  }

  .action-dock {
    flex-direction: column;
  }

  .start-btn {
    font-size: 1.4rem;
    padding: 1rem;
    width: 100%;
  }
}
.mode-selector {
  display: flex;
  gap: 1rem;
  width: 100%;
}

.mode-btn {
  flex: 1;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  color: #888;
  padding: 1rem;
  font-family: inherit;
  cursor: pointer;
  text-transform: uppercase;
  font-weight: bold;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
}

.mode-btn:hover {
  background: rgba(0, 255, 255, 0.1);
  color: #fff;
  border-color: #555;
}

.mode-btn.active {
  background: rgba(0, 255, 255, 0.2);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.2);
}

.mode-btn .sub {
  display: block;
  font-size: 0.7rem;
  margin-top: 0.3rem;
  color: var(--primary);
  opacity: 0.8;
}
</style>
