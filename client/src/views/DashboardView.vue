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
    Titan: "ABILITY: Juggernaut (Heal & Resistance)",
    Brawler: "ABILITY: Berserker (Rapid Fire & Speed)",
    Goliath: "ABILITY: Fortress (Shield & Repair)",
    Citadel: "ABILITY: Ironclad (Invulnerability)",

    // Speed / Mobility
    Spectre: "ABILITY: Phantom Dash (High Speed Phase)",
    Volt: "ABILITY: Overload (Super Speed)",
    Ghost: "ABILITY: Phasing (Wall Pass-Through)",
    Jumper: "ABILITY: Blink Drive (Short-Range Teleport)",
    Mirage: "ABILITY: Holographic Decoy (Clone & Stealth)",

    // Support / defense
    Techno: "ABILITY: Mine Layer (Explosive Traps)",
    Engineer: "ABILITY: Force Field (Deployable Barrier)",
    Medic: "ABILITY: Nano-Repair (Self Healing)",

    // Damage / Offense
    Blaze: "ABILITY: Rapid Fire (High Fire Rate)",
    Frost: "ABILITY: Cryo Rounds (Freezing Shots)",
    Sniper: "ABILITY: Railgun (Piercing High Damage)",
    Shadow: "ABILITY: Optical Camouflage (Invisibility)",
    Nova: "ABILITY: Supernova (Explosive Radial Blast)",
    Magma: "ABILITY: Lava Wave (Triple Projectile Fan)",
    Storm: "ABILITY: Tesla Storm (Chain Lightning & Speed)",
    Viper: "ABILITY: Viper's Kiss (Poisonous Rounds)",
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
      <div class="header-actions">
        <button @click="router.push('/settings')" class="btn btn-secondary">
          SETTINGS
        </button>
        <button @click="logout" class="btn btn-secondary">LOGOUT</button>
      </div>
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
              <span class="mode-title">ARENA</span>
              <span class="sub">FFA DEATHMATCH</span>
            </button>
            <button
              class="mode-btn"
              :class="{ active: selectedMode === 'battle_royale' }"
              @click="selectedMode = 'battle_royale'"
            >
              <span class="mode-title">BATTLE ROYALE</span>
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
/* COCKPIT / HUD THEME */
@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap");

:root {
  --neon-cyan: #00f3ff;
  --neon-gold: #ffd700;
  --neon-red: #ff3333;
  --glass-bg: rgba(10, 15, 25, 0.7);
  --glass-border: rgba(0, 243, 255, 0.3);
}

.dashboard-page {
  min-height: 100vh;
  background-color: #020205;
  background-image: radial-gradient(
      circle at 50% 50%,
      rgba(0, 243, 255, 0.05) 0%,
      transparent 60%
    ),
    linear-gradient(rgba(0, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 100% 100%, 40px 40px, 40px 40px;
  color: #fff;
  font-family: "Rajdhani", sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* VIGNETTE & SCANLINES */
.dashboard-page::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
    linear-gradient(
      90deg,
      rgba(255, 0, 0, 0.06),
      rgba(0, 255, 0, 0.02),
      rgba(0, 0, 255, 0.06)
    );
  background-size: 100% 2px, 3px 100%;
  pointer-events: none;
  z-index: 5;
  opacity: 0.6;
}

/* MOVING GRID BACKGROUND */
.dashboard-page::before {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background-image: linear-gradient(
      0deg,
      transparent 24%,
      rgba(0, 243, 255, 0.05) 25%,
      rgba(0, 243, 255, 0.05) 26%,
      transparent 27%,
      transparent 74%,
      rgba(0, 243, 255, 0.05) 75%,
      rgba(0, 243, 255, 0.05) 76%,
      transparent 77%,
      transparent
    ),
    linear-gradient(
      90deg,
      transparent 24%,
      rgba(0, 243, 255, 0.05) 25%,
      rgba(0, 243, 255, 0.05) 26%,
      transparent 27%,
      transparent 74%,
      rgba(0, 243, 255, 0.05) 75%,
      rgba(0, 243, 255, 0.05) 76%,
      transparent 77%,
      transparent
    );
  background-size: 100px 100px;
  transform: perspective(500px) rotateX(60deg);
  animation: grid-move 20s linear infinite;
  z-index: 0;
}

@keyframes grid-move {
  0% {
    transform: perspective(500px) rotateX(60deg) translateY(0);
  }
  100% {
    transform: perspective(500px) rotateX(60deg) translateY(100px);
  }
}

/* TOP BAR */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 3rem;
  background: rgba(0, 3, 10, 0.85);
  border-bottom: 1px solid rgba(0, 243, 255, 0.2);
  backdrop-filter: blur(15px);
  z-index: 20;
  box-shadow: 0 5px 30px rgba(0, 0, 0, 0.5);
}

.user-info {
  display: flex;
  gap: 2rem;
  font-family: "Orbitron", sans-serif;
  letter-spacing: 2px;
  font-size: 0.9rem;
}

.user-info .neon-text {
  color: #fff;
  text-shadow: 0 0 10px rgba(0, 243, 255, 0.6);
}

.coins {
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}

.header-actions {
  display: flex;
  gap: 1rem;
}

/* MAIN CONTAINER */
.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 10;
  perspective: 1000px;
  height: 100vh; /* Force full height alignment */
  padding-bottom: 2rem;
}

.section-title {
  font-family: "Orbitron", sans-serif;
  font-size: 3rem; /* Reduced from 4rem */
  font-weight: 900;
  letter-spacing: 8px; /* Reduced */
  margin-bottom: 1rem; /* Reduced from 2rem */
  text-transform: uppercase;
  background: linear-gradient(180deg, #fff 0%, #b0b0b0 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 15px rgba(0, 243, 255, 0.4));
  position: relative;
  animation: title-float 4s ease-in-out infinite;
}

@keyframes title-float {
  0%,
  100% {
    transform: translateY(0);
    filter: drop-shadow(0 0 15px rgba(0, 243, 255, 0.4));
  }
  50% {
    transform: translateY(-5px);
    filter: drop-shadow(0 0 25px rgba(0, 243, 255, 0.7));
  }
}

/* GLITCH EFFECT */
.glitch-effect {
  position: relative;
}

.glitch-effect::before,
.glitch-effect::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.glitch-effect::before {
  left: 2px;
  text-shadow: -1px 0 #ff00c1;
  clip: rect(44px, 450px, 56px, 0);
  animation: glitch-anim 5s infinite linear alternate-reverse;
}

.glitch-effect::after {
  left: -2px;
  text-shadow: -1px 0 #00fff9;
  clip: rect(44px, 450px, 56px, 0);
  animation: glitch-anim2 5s infinite linear alternate-reverse;
}

@keyframes glitch-anim {
  0% {
    clip: rect(11px, 9999px, 81px, 0);
  }
  20% {
    clip: rect(74px, 9999px, 30px, 0);
  }
  40% {
    clip: rect(48px, 9999px, 20px, 0);
  }
  60% {
    clip: rect(27px, 9999px, 66px, 0);
  }
  80% {
    clip: rect(32px, 9999px, 92px, 0);
  }
  100% {
    clip: rect(85px, 9999px, 58px, 0);
  }
}

@keyframes glitch-anim2 {
  0% {
    clip: rect(69px, 9999px, 73px, 0);
  }
  20% {
    clip: rect(4px, 9999px, 86px, 0);
  }
  40% {
    clip: rect(87px, 9999px, 14px, 0);
  }
  60% {
    clip: rect(6px, 9999px, 27px, 0);
  }
  80% {
    clip: rect(10px, 9999px, 2px, 0);
  }
  100% {
    clip: rect(58px, 9999px, 91px, 0);
  }
}

.main-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem; /* Reduced from 2rem */
  width: 100%;
  max-width: 650px;
}

/* HERO CARD (HOLOGRAPHIC) */
.hero-display-card {
  position: relative;
  background: rgba(10, 15, 30, 0.6);
  border: 1px solid rgba(0, 243, 255, 0.3);
  width: 100%;
  padding: 1.5rem 2.5rem; /* Reduced from 3rem */
  text-align: center;
  backdrop-filter: blur(20px);
  border-radius: 4px; /* Slight round */

  /* Cyber Corners */
  clip-path: polygon(
    20px 0,
    100% 0,
    100% calc(100% - 20px),
    calc(100% - 20px) 100%,
    0 100%,
    0 20px
  );

  box-shadow: 0 0 30px rgba(0, 243, 255, 0.1), inset 0 0 60px rgba(0, 0, 0, 0.5);

  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.hero-display-card:hover {
  transform: translateY(-5px) scale(1.01);
  box-shadow: 0 0 50px rgba(0, 243, 255, 0.2), inset 0 0 40px rgba(0, 0, 0, 0.3);
  border-color: rgba(0, 243, 255, 0.6);
}

.hero-name {
  font-family: "Orbitron", sans-serif;
  font-size: 4rem; /* Reduced from 5rem */
  font-weight: 900;
  margin: 0;
  line-height: 1;
  color: #fff;
  text-shadow: 0 0 20px rgba(0, 243, 255, 0.8), 0 0 40px rgba(0, 243, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 4px;
}

.cyber-header {
  font-family: "Rajdhani", sans-serif;
  color: rgba(0, 243, 255, 0.7);
  font-size: 0.9rem;
  letter-spacing: 4px;
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.hero-class-badge {
  display: inline-block;
  margin-top: 0.5rem; /* Reduced */
  padding: 0.3rem 1.2rem;
  background: rgba(0, 243, 255, 0.1);
  border: 1px solid #00f3ff;
  color: #00f3ff;
  font-family: "Orbitron", sans-serif;
  font-size: 0.8rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
}

.stats-box {
  margin-top: 1.5rem; /* Reduced */
  padding: 1rem; /* Reduced */
  background: rgba(0, 0, 0, 0.4);
  border-left: 4px solid #00f3ff;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.stats-box::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(0, 243, 255, 0.05),
    transparent
  );
  transform: translateX(-100%);
  animation: shine 3s infinite;
}

@keyframes shine {
  0% {
    transform: translateX(-100%);
  }
  20% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.label {
  color: #888;
  font-size: 0.75rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  display: block;
  margin-bottom: 0.2rem;
}

.value {
  color: #fff;
  font-size: 1.2rem;
  font-weight: 700;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
  font-family: "Rajdhani", sans-serif;
}

/* BUTTONS */
.change-btn {
  margin-top: 1.5rem; /* Reduced */
  width: 100%;
  padding: 1rem; /* Reduced */
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.6);
  font-family: "Orbitron", sans-serif;
  letter-spacing: 3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.change-btn:hover {
  border-color: #00f3ff;
  color: #00f3ff;
  background: rgba(0, 243, 255, 0.05);
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);
}

.change-btn::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0%;
  height: 2px;
  background: #00f3ff;
  transition: width 0.3s ease;
}
.change-btn:hover::after {
  width: 100%;
}

/* MODE SELECTOR */
.mode-selector {
  display: flex;
  gap: 1rem;
  width: 100%;
}

.mode-btn {
  flex: 1;
  background: rgba(5, 5, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.8rem; /* Compact padding */
  cursor: pointer;
  font-family: "Orbitron", sans-serif;
  color: #666;
  text-align: center;
  transition: all 0.3s;
  clip-path: polygon(
    15px 0,
    100% 0,
    100% calc(100% - 15px),
    calc(100% - 15px) 100%,
    0 100%,
    0 15px
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.mode-btn.active {
  background: rgba(0, 243, 255, 0.15);
  border-color: #00f3ff;
  color: #fff;
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);
}

/* Removed clipped ::before "SELECTED" badge */
/* Replaced with text shadow/glow on active state */
.mode-btn.active .mode-title {
  text-shadow: 0 0 10px #00f3ff;
}

.mode-btn .mode-title {
  font-size: 1rem;
  font-weight: bold;
}

.mode-btn .sub {
  display: block;
  font-family: "Rajdhani", sans-serif;
  font-size: 0.7rem;
  margin-top: 0.3rem;
  color: #00f3ff;
  opacity: 0.7;
}

/* ACTION DOCK (BIG BUTTONS) */
.action-dock {
  display: flex;
  gap: 1.5rem;
  width: 100%;
  margin-top: 0.5rem;
}

.rank-btn {
  flex: 1; /* Equal width for symmetry */
  background: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #ffd700;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  font-family: "Orbitron";
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
}

.rank-btn:hover {
  background: rgba(255, 215, 0, 0.15);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
}

.start-btn {
  flex: 1; /* Equal width for symmetry */
  font-family: "Orbitron", sans-serif;
  font-weight: 900;
  font-size: 1.4rem; /* Adjusted for width */
  letter-spacing: 3px;
  background: linear-gradient(135deg, #00f3ff 0%, #0066ff 100%);
  color: #000;
  border: none;
  padding: 1rem;
  cursor: pointer;
  clip-path: polygon(
    20px 0,
    100% 0,
    100% calc(100% - 20px),
    calc(100% - 20px) 100%,
    0 100%,
    0 20px
  );
  box-shadow: 0 0 30px rgba(0, 243, 255, 0.4);
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.start-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 0 50px rgba(0, 243, 255, 0.8);
  filter: brightness(1.2);
}

.start-btn::after {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent,
    rgba(255, 255, 255, 0.8),
    transparent
  );
  transform: rotate(45deg) translateY(-100%);
  animation: shimmer 3s infinite;
}

@keyframes shimmer {
  0% {
    transform: rotate(45deg) translateY(-100%);
  }
  20% {
    transform: rotate(45deg) translateY(100%);
  }
  100% {
    transform: rotate(45deg) translateY(100%);
  }
}

/* ERROR & LOADING */
.loading-state,
.error-banner {
  font-family: "Orbitron";
  font-size: 1.5rem;
  letter-spacing: 2px;
  text-shadow: 0 0 10px #ff0000;
  text-align: center;
}

.bg-watermark {
  position: absolute;
  opacity: 0.1;
  filter: blur(2px) grayscale(100%);
  pointer-events: none;
  z-index: 1;
}
.bg-watermark.left {
  left: 10%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  height: 600px;
  background: url("/logo_icon-removebg.png") no-repeat center/contain;
}
.bg-watermark.right {
  right: 10%;
  top: 50%;
  transform: translate(50%, -50%);
  width: 600px;
  height: 600px;
  background: url("/logo_icon-removebg.png") no-repeat center/contain;
}

/* RESPONSIVE */
@media (max-width: 768px) {
  .hero-name {
    font-size: 3rem;
  }
  .action-dock {
    flex-direction: column;
  }
  .start-btn {
    font-size: 1.5rem;
  }
  .main-panel {
    max-width: 90%;
  }
}
</style>
