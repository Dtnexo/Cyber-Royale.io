<script setup>
import { ref, computed, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useGameStore } from "../stores/game";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const game = useGameStore();
const auth = useAuthStore();

const selectedClass = ref("Damage");
const classes = ["Damage", "Tank", "Speed", "Support"];

// Filter heroes
const filteredHeroes = computed(() => {
  return game.allHeroes.filter((h) => h.class === selectedClass.value);
});

const isOwned = (heroId) => {
  return auth.user?.unlockedHeroes?.includes(heroId);
};

const handleSelect = (heroId) => {
  game.selectHero(heroId);
};

const showUnlockAnim = ref(false);

const handleBuy = async (heroId) => {
  const wasOwned = isOwned(heroId);
  await game.buyHero(heroId);
  // Check if ownership changed effectively
  if (!wasOwned && isOwned(heroId)) {
    showUnlockAnim.value = true;
    // Play a sound if we had one, for now just visual
    setTimeout(() => {
      showUnlockAnim.value = false;
    }, 2000);
  }
};

// Skin Selection (Persisted via GameStore)
const selectedSkinIndex = ref(0);

watch(
  () => game.selectedHeroId,
  (newId) => {
    if (newId) {
      selectedSkinIndex.value = game.getSelectedSkin(newId);
    }
  }
);

const selectSkin = (heroId, index) => {
  selectedSkinIndex.value = index;
  game.selectSkin(heroId, index);
};

const viewingHeroId = ref(null);

watchEffect(() => {
  if (!viewingHeroId.value && game.selectedHeroId) {
    viewingHeroId.value = game.selectedHeroId;
  }
});

const viewHero = (heroId) => {
  viewingHeroId.value = heroId;
  selectedSkinIndex.value = game.getSelectedSkin(heroId);
};

const equipHero = () => {
  if (viewingHeroId.value) {
    game.selectHero(viewingHeroId.value);
  }
};

const getHeroDesc = (hero) => {
  const descs = {
    Vanguard: "ABILITY: Reflector Shield (Invulnerable 3s)",
    Titan: "ABILITY: Juggernaut (+HP, -Speed)",
    Brawler: "ABILITY: Berserker (Rapid Fire, +Speed)",
    Goliath: "ABILITY: Fortress (Rooted, Heal, Invulnerable)",
    Spectre: "ABILITY: Blink (Teleport)",
    Volt: "ABILITY: Overload (Super Speed)",
    Ghost: "ABILITY: Phasing (Walk through walls)",
    Techno: "ABILITY: Proximity Mine",
    Engineer: "ABILITY: Force Field (Block shots)",
    Medic: "ABILITY: Regenerator (Area Heal)",
    Blaze: "ABILITY: Rapid Fire",
    Frost: "ABILITY: Freeze Shot (Freezes Enemy)",
    Sniper: "ABILITY: Railgun (High Dmg, Fast Shot)",
    Shadow: "ABILITY: Stealth (Invisible 5s)",
    Nova: "ABILITY: Nova Blast (Radial Attack)",
    Citadel: "ABILITY: Fortress (Invincible + Immobile)",
    Magma: "ABILITY: Eruption (Lava Mines)",
    Storm: "ABILITY: Overload (Lightning Storm)",
    Viper: "ABILITY: Venom (Poison Ammo + Slow)",
    Mirage: "ABILITY: Decoy (Spawn Clone + Stealth)",
    Jumper: "ABILITY: Blink (Teleport)",
  };
  return descs[hero.name] || "ABILITY: Standard Combat";
};

const goBack = () => {
  router.push("/dashboard");
};
</script>

<template>
  <div class="heroes-page">
    <div class="header">
      <button @click="goBack" class="btn btn-secondary">
        &lt; RETURN TO BASE
      </button>
      <div class="header-info">
        <h1 class="page-title glitch-effect" data-text="ARMORY">ARMORY</h1>
        <div class="credits">CREDITS: {{ auth.user?.coins || 0 }} 🪙</div>
      </div>
    </div>

    <!-- Main Content Split -->
    <div class="main-content">
      <!-- Left Panel: Hero Grid & Filters -->
      <div class="left-panel">
        <div class="class-tabs">
          <button
            v-for="c in classes"
            :key="c"
            class="tab-btn"
            :class="{ active: selectedClass === c }"
            @click="selectedClass = c"
          >
            {{ c }}
          </button>
        </div>

        <div class="heroes-grid-container">
          <div class="heroes-grid">
            <div
              v-for="hero in filteredHeroes"
              :key="hero.id"
              class="hero-card"
              :class="{
                active: viewingHeroId === hero.id,
                equipped: game.selectedHeroId === hero.id,
                locked: !isOwned(hero.id),
              }"
              @click="viewHero(hero.id)"
            >
              <div class="card-content">
                <div
                  class="hero-icon-placeholder"
                  :style="{
                    backgroundColor: hero.skins[0]?.value || '#444',
                    boxShadow: `0 0 15px ${hero.skins[0]?.value || '#444'}`,
                  }"
                ></div>
                <div class="hero-header">
                  <h3>{{ hero.name }}</h3>
                  <span
                    v-if="game.selectedHeroId === hero.id"
                    class="badge-equipped"
                    >EQUIPPED</span
                  >
                </div>
                <div class="hero-footer">
                  <span v-if="!isOwned(hero.id)" class="price"
                    >{{ hero.price }} CR</span
                  >
                  <span v-else class="owned-label">OWNED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Details -->
      <div class="right-panel">
         <!-- UNLOCK OVERLAY ANIMATION -->
        <transition name="unlock-flash">
          <div v-if="showUnlockAnim" class="unlock-overlay">
            <div class="unlock-content">
              <div class="unlock-icon">🔓</div>
              <div class="unlock-text">SYSTEM UNLOCKED</div>
              <div class="unlock-sub">BLUEPRINT ACQUIRED</div>
            </div>
          </div>
        </transition>

        <div v-if="viewingHeroId" class="detail-content">
          <!-- We retrieve the hero object safely -->
          <div class="detail-header">
            <h2
              class="detail-name"
              :style="{
                color:
                  game.getHeroById(viewingHeroId)?.skins[selectedSkinIndex]
                    ?.value,
              }"
            >
              {{ game.getHeroById(viewingHeroId)?.name }}
            </h2>
            <div class="detail-class">
              {{ game.getHeroById(viewingHeroId)?.class }} CLASS
            </div>
          </div>

          <div class="detail-body">
            <div class="info-block">
              <label>COMBAT ABILITY</label>
              <p class="ability-text">
                {{ getHeroDesc(game.getHeroById(viewingHeroId)) }}
              </p>
            </div>

            <div class="info-block">
              <label>STATS OVERVIEW</label>
              <div class="stats-bars">
                <div class="stat-item">
                  <span>HP</span>
                  <div class="bar">
                    <div
                      class="fill"
                      :style="{
                        width:
                          (game.getHeroById(viewingHeroId)?.stats.hp / 300) *
                            100 +
                          '%',
                      }"
                    ></div>
                  </div>
                </div>
                <div class="stat-item">
                  <span>SPD</span>
                  <div class="bar">
                    <div
                      class="fill"
                      :style="{
                        width:
                          (game.getHeroById(viewingHeroId)?.stats.speed / 200) *
                            100 +
                          '%',
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="info-block">
              <label>SKIN VARIANT</label>
              <div class="skins-row">
                <div
                  v-for="(skin, idx) in game.getHeroById(viewingHeroId)?.skins"
                  :key="idx"
                  class="skin-option"
                  :class="{ selected: selectedSkinIndex === idx }"
                  :style="{ backgroundColor: skin.value }"
                  @click="selectSkin(viewingHeroId, idx)"
                  :title="skin.name"
                ></div>
              </div>
              <div class="skin-name">
                {{
                  game.getHeroById(viewingHeroId)?.skins[selectedSkinIndex]
                    ?.name
                }}
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <div v-if="isOwned(viewingHeroId)">
              <button
                v-if="game.selectedHeroId === viewingHeroId"
                class="btn action-btn equipped"
                disabled
              >
                SYSTEM ACTIVE
              </button>
              <button v-else @click="equipHero" class="btn action-btn equip">
                INITIALIZE SYSTEM (EQUIP)
              </button>
            </div>
            <div v-else>
              <button
                @click="handleBuy(viewingHeroId)"
                class="btn action-btn buy"
                :disabled="
                  auth.user.coins < game.getHeroById(viewingHeroId)?.price
                "
              >
                UNLOCK // {{ game.getHeroById(viewingHeroId)?.price }} CR
              </button>
              <div
                v-if="auth.user.coins < game.getHeroById(viewingHeroId)?.price"
                class="err-msg"
              >
                INSUFFICIENT FUNDS
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">SELECT A BLUEPRINT</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap');

:root {
  --neon-cyan: #00f3ff;
  --neon-gold: #ffd700;
  --glass-bg: rgba(10, 15, 25, 0.7);
}

/* PAGE BASE */
.heroes-page {
  min-height: 100vh;
  background-color: #020205;
  background-image: 
    radial-gradient(circle at 50% 50%, rgba(0, 243, 255, 0.05) 0%, transparent 60%),
    linear-gradient(rgba(0, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 100% 100%, 40px 40px, 40px 40px;
  color: #fff;
  font-family: 'Rajdhani', sans-serif;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Vignette & Scanlines */
.heroes-page::after {
  content: "";
  position: absolute;
  inset: 0;
  background: 
    linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), 
    linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
  background-size: 100% 2px, 3px 100%;
  pointer-events: none;
  z-index: 5;
  opacity: 0.5;
}

/* HEADER */
.header {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 3rem;
  background: rgba(0, 3, 10, 0.85);
  border-bottom: 1px solid rgba(0, 243, 255, 0.2);
  backdrop-filter: blur(15px);
  box-shadow: 0 5px 30px rgba(0, 0, 0, 0.5);
}

.header-info {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.page-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: 8px;
  color: #fff;
  margin: 0;
  text-transform: uppercase;
  background: linear-gradient(180deg, #fff 0%, #b0b0b0 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 10px rgba(0, 243, 255, 0.5));
}

.credits {
  font-family: 'Orbitron', sans-serif;
  color: #ffd700;
  font-size: 1.2rem;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  margin-top: 0.5rem;
}

.btn-secondary {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #aaa;
  padding: 0.8rem 1.5rem;
  cursor: pointer;
  transition: all 0.3s;
  letter-spacing: 2px;
  font-family: 'Orbitron', sans-serif;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.btn-secondary:hover {
  border-color: #00f3ff;
  color: #00f3ff;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
}

/* MAIN CONTENT SPLIT */
.main-content {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: 1.5rem 2rem; /* Reduced top/bottom padding */
  gap: 1.5rem; /* Reduced gap */
}

/* LEFT PANEL */
.left-panel {
  flex: 3;
  display: flex;
  flex-direction: column;
  /* Glass card styling */
  background: rgba(10, 15, 30, 0.6); /* More opaque */
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  backdrop-filter: blur(15px);
  padding: 0; 
  overflow: hidden;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
}

/* LEFT PANEL INTERNALS */
.class-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  padding: 0.8rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  gap: 0.8rem;
  justify-content: center;
}

/* Explicitly target button element to override user-agent styles */
button.tab-btn {
  background: rgba(30, 35, 45, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #aaa;
  padding: 0.6rem 0.5rem;
  cursor: pointer;
  font-family: 'Orbitron', sans-serif;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: all 0.3s;
  font-size: 0.85rem;
  flex: 1; /* Stretch to fill */
  text-align: center;
  /* Ensure browser defaults are reset */
  appearance: none;
  -webkit-appearance: none;
  border-radius: 2px;
}

button.tab-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  border-color: #fff;
}

/* Specific class colors for active state */
button.tab-btn.active {
  color: #111;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
  transform: scale(1.05); /* Slightly larger */
  z-index: 10;
  border-width: 0; 
  font-weight: 900;
}

/* Colors for each class index */
button.tab-btn:nth-child(1).active { 
  background: #ff4444; 
  box-shadow: 0 0 20px rgba(255, 68, 68, 0.6);
}
button.tab-btn:nth-child(2).active { 
  background: #4444ff; 
  box-shadow: 0 0 20px rgba(68, 68, 255, 0.6);
}
button.tab-btn:nth-child(3).active { 
  background: #ffff44; 
  box-shadow: 0 0 20px rgba(255, 255, 68, 0.6);
}
button.tab-btn:nth-child(4).active { 
  background: #44ff44; 
  box-shadow: 0 0 20px rgba(68, 255, 68, 0.6);
}

.heroes-grid-container {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* Grid Layout */
.heroes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); 
  gap: 1rem;
}

.hero-card {
  background: rgba(20, 25, 40, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

/* LOCKED STATE */
.hero-card.locked {
  filter: grayscale(100%) brightness(0.6);
  opacity: 0.7;
  border-style: dashed;
}

.hero-card.locked::after {
  content: "LOCKED";
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  border: 2px solid #fff;
  padding: 0.5rem 1rem;
  font-family: 'Orbitron';
  font-weight: 900;
  font-size: 1.2rem;
  color: #fff;
  opacity: 0.5;
  pointer-events: none;
}

.hero-card:hover {
  border-color: #00f3ff;
  transform: translateY(-3px);
  background: rgba(0, 243, 255, 0.05);
  filter: grayscale(0%) brightness(1); 
  opacity: 1;
}

.hero-card.active {
  border-color: #00f3ff;
  background: rgba(0, 243, 255, 0.1);
  box-shadow: inset 0 0 20px rgba(0, 243, 255, 0.1);
  filter: none;
  opacity: 1;
}

.hero-card.equipped::before { 
  content: "EQUIPPED";
  position: absolute;
  top: 0;
  right: 0;
  font-size: 0.7rem;
  background: #ffd700;
  color: #000;
  padding: 2px 6px;
  font-family: 'Orbitron';
  font-weight: bold;
  z-index: 2;
  border-bottom-left-radius: 4px;
}

.card-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
}

.hero-icon-placeholder {
  width: 70px;
  height: 70px;
  border-radius: 5px;
  box-shadow: 0 0 15px rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.2);
  transition: all 0.3s;
}

.hero-card:hover .hero-icon-placeholder {
  transform: scale(1.05);
  border-color: #00f3ff;
}

.hero-header {
  text-align: center;
}

.hero-header h3 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 1.1rem;
  letter-spacing: 1px;
  color: #fff;
  text-transform: uppercase;
}

.badge-equipped {
  display: none;
}

.hero-footer {
  width: 100%;
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 0.5rem;
  font-family: 'Rajdhani', sans-serif;
  font-weight: bold;
  font-size: 0.9rem;
}

/* RIGHT PANEL (DETAILS) */
.right-panel {
  flex: 2;
  background: rgba(10, 15, 20, 0.95); /* Solid dark background */
  border: 1px solid rgba(0, 243, 255, 0.3);
  padding: 3rem; /* Restored spacious padding */
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: -10px 0 50px rgba(0, 0, 0, 0.8);
  clip-path: polygon(30px 0, 100% 0, 100% 100%, 0 100%, 0 30px); /* Tech corner */
}

/* Decorative corner lines */
.right-panel::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 150px; height: 150px;
  border-top: 2px solid #00f3ff;
  border-left: 2px solid #00f3ff;
  clip-path: polygon(0 0, 100% 0, 0 100%);
  opacity: 0.5;
  pointer-events: none;
}

.detail-header {
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 1.5rem;
  margin-bottom: 2rem;
  position: relative;
}


.detail-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 4rem;
  font-weight: 900;
  margin: 0;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 0 20px rgba(0, 243, 255, 0.6);
  line-height: 0.9;
}

.detail-class {
  color: #ffd700;
  font-family: 'Orbitron', sans-serif;
  font-size: 1.5rem;
  letter-spacing: 6px;
  margin-top: 1rem;
  text-transform: uppercase;
  display: inline-block;
}

.info-block {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  position: relative;
}

.info-block label {
  display: inline-block;
  background: #00f3ff;
  color: #000;
  font-family: 'Orbitron';
  font-weight: bold;
  font-size: 0.8rem;
  padding: 2px 8px;
  letter-spacing: 1px;
  position: absolute;
  top: -10px;
  left: 10px;
  text-transform: uppercase;
}

.ability-text {
  font-size: 1.1rem;
  color: #eee;
  line-height: 1.6;
  font-family: 'Rajdhani', sans-serif;
}

.stats-bars {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
}

.stat-item span {
  width: 60px;
  font-family: 'Orbitron';
  font-weight: bold;
  color: #00f3ff;
  font-size: 0.9rem;
}

.bar {
  flex: 1;
  height: 12px;
  background: #111;
  border: 1px solid #333;
  position: relative;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: repeating-linear-gradient(
    45deg,
    #00f3ff,
    #00f3ff 10px,
    #00c3cc 10px,
    #00c3cc 20px
  );
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.5);
}

.skins-row {
 display: flex;
 gap: 0.5rem;
 margin-top: 1rem;
}

.skin-option {
 width: 40px; height: 40px;
 border: 2px solid rgba(255,255,255,0.2);
 cursor: pointer;
 transition: all 0.2s;
}
.skin-option:hover { border-color: #fff; }
.skin-option.selected { border-color: #00f3ff; box-shadow: 0 0 10px #00f3ff; }

.detail-actions {
 margin-top: auto;
 display: flex;
 gap: 1rem;
}

.action-btn {
 flex: 1;
 padding: 1rem;
 font-family: 'Orbitron';
 font-weight: bold;
 border: none;
 cursor: pointer;
 text-transform: uppercase;
 letter-spacing: 2px;
 clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
 transition: all 0.2s;
}

.action-btn.equip {
 background: linear-gradient(90deg, #00f3ff, #00c3cc);
 color: #000;
}
.action-btn.buy {
 background: linear-gradient(90deg, #ffd700, #ffaa00);
 color: #000;
}
.action-btn.buy:disabled {
  background: rgba(255, 50, 50, 0.1);
  border: 1px solid rgba(255, 0, 0, 0.3);
  color: #ff5555;
  cursor: not-allowed;
  box-shadow: none;
  background-image: none;
}
.action-btn.equipped {
 background: rgba(255, 255, 255, 0.1);
 color: #aaa;
 border: 1px solid rgba(255, 255, 255, 0.2);
 cursor: default;
}

/* UNLOCK ANIMATION */
.unlock-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 243, 255, 0.2);
  backdrop-filter: blur(10px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: bg-pulse 2s infinite;
  border: 2px solid #00f3ff;
}

.unlock-content {
  text-align: center;
  background: rgba(0, 0, 0, 0.8);
  padding: 3rem;
  border: 1px solid #00f3ff;
  box-shadow: 0 0 50px rgba(0, 243, 255, 0.5);
  transform: scale(1);
}

.unlock-icon {
  font-size: 5rem;
  margin-bottom: 1rem;
  animation: pop-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.unlock-text {
  font-family: 'Orbitron';
  font-size: 2.5rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 20px #00f3ff;
  letter-spacing: 5px;
}

.unlock-sub {
  font-family: 'Rajdhani';
  font-size: 1.5rem;
  color: #ffd700;
  letter-spacing: 8px;
  margin-top: 0.5rem;
  text-transform: uppercase;
}

/* Transitions */
.unlock-flash-enter-active,
.unlock-flash-leave-active {
  transition: all 0.5s ease;
}

.unlock-flash-enter-from {
  opacity: 0;
  transform: scale(1.1);
}
.unlock-flash-leave-to {
  opacity: 0;
  filter: blur(10px);
}

@keyframes bg-pulse {
  0% { background: rgba(0, 243, 255, 0.2); }
  50% { background: rgba(0, 243, 255, 0.4); }
  100% { background: rgba(0, 243, 255, 0.2); }
}

@keyframes pop-in {
  0% { transform: scale(0) rotate(-180deg); opacity: 0; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

  /* RESPONSIVE */
  @media (max-width: 768px) {
    /* Layout Base */
    .heroes-page {
      height: 100vh;
      overflow: hidden;
    }

    /* Header - Compact */
    .header {
      padding: 0.5rem 1rem;
      flex-direction: row;
      height: 60px;
      gap: 0.5rem;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
    }

    .page-title {
      font-size: 1.2rem;
      line-height: 1.2;
    }

    .credits {
      font-size: 0.8rem;
      line-height: 1.2;
    }

    .btn-secondary {
      padding: 0.4rem 0.8rem;
      font-size: 0.7rem;
      white-space: nowrap;
    }

    /* Main Split */
  .main-content {
    flex-direction: column;
    height: calc(100vh - 60px);
  }

  /* TOP: LIST (35%) */
  .left-panel {
    flex: none;
    height: 35%;
    border-right: none;
    border-bottom: 2px solid var(--primary-dim);
    padding: 0.5rem;
    padding-bottom: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Scrollable Tabs */
  .class-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    overflow-x: auto;
    white-space: nowrap;
    justify-content: flex-start;
    padding-bottom: 5px;
    flex-shrink: 0;
  }
  /* Hide Scrollbar for tabs */
  .class-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab-btn {
    min-width: auto;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .heroes-grid-container {
    padding-right: 0;
    flex: 1;
    overflow-y: auto;
  }

  .heroes-grid {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.5rem;
    padding-bottom: 1rem;
  }

  .hero-card .card-content {
    padding: 0.5rem;
  }

  .hero-icon-placeholder {
    width: 30px;
    height: 30px;
  }

  .hero-header h3 {
    font-size: 0.8rem;
  }

  /* BOTTOM: DETAILS (65%) */
  .right-panel {
    flex: 1;
    border-left: none;
    padding: 1rem;
    background: rgba(10, 10, 12, 0.98);
    overflow-y: auto;
  }

  .detail-name {
    font-size: 1.5rem;
    margin-bottom: 0.2rem;
  }

  .detail-class {
    font-size: 0.9rem;
  }

  .info-block {
    margin-bottom: 1rem;
  }

  .ability-text {
    font-size: 0.9rem;
    padding: 0.5rem;
  }

  .action-btn {
    padding: 0.8rem;
    font-size: 1rem;
    margin-top: 0.5rem;
  }

  .skin-option {
    width: 35px;
    height: 35px;
  }
}
</style>
