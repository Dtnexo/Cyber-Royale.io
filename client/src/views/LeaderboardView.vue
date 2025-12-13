<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import api from "../utils/axios";

const router = useRouter();
const leaders = ref([]);
const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  try {
    const res = await api.get("/leaderboard");
    leaders.value = res.data;
  } catch (err) {
    error.value = "Unable to retrieve Global Rankings.";
    console.error(err);
  } finally {
    loading.value = false;
  }
});

const goBack = () => {
  router.push("/dashboard");
};
</script>

<template>
  <div class="leaderboard-page">
    <div class="header">
      <button @click="goBack" class="btn btn-secondary">BACK</button>
      <h1 class="neon-text">GLOBAL RANKINGS</h1>
      <div style="width: 80px"></div>
      <!-- Spacer -->
    </div>

    <div class="content-container">
      <div v-if="loading" class="loading">CALCULATING METRICS...</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="rankings-list">
        <div class="rank-header">
          <span>RANK</span>
          <span>OPERATIVE</span>
          <span>CONFIRMED KILLS</span>
          <span>CREDITS</span>
        </div>

        <div
          v-for="(user, index) in leaders"
          :key="user.username"
          class="rank-row"
          :class="{ top3: index < 3 }"
        >
          <span class="rank">#{{ index + 1 }}</span>
          <span class="name">{{ user.username }}</span>
          <span class="kills">{{ user.kills }}</span>
          <span class="coins">{{ user.coins }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Page Layout & Background */
.leaderboard-page {
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

.leaderboard-page::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at center, transparent 0%, #000 90%);
  pointer-events: none;
  z-index: 1;
}

.header {
  position: relative;
  z-index: 2;
  padding: 1rem 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.8);
  border-bottom: 2px solid var(--primary-dim);
  backdrop-filter: blur(10px);
}

.header h1 {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 4px;
  color: #fff;
  text-shadow: 0 0 10px var(--primary);
  margin: 0;
}

.content-container {
  position: relative;
  z-index: 2;
  padding: 2rem;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.loading,
.error {
  text-align: center;
  margin-top: 5rem;
  font-size: 1.5rem;
  color: var(--primary-dim);
  text-shadow: 0 0 5px var(--primary-dim);
  letter-spacing: 2px;
}

.rankings-list {
  background: rgba(10, 15, 20, 0.9);
  border: 1px solid var(--primary-dim);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

.rank-header {
  display: grid;
  grid-template-columns: 80px 1fr 150px 150px;
  padding: 1.5rem 1rem;
  background: rgba(0, 243, 255, 0.05);
  border-bottom: 2px solid var(--primary-dim);
  font-weight: bold;
  color: var(--primary);
  letter-spacing: 2px;
  text-transform: uppercase;
  font-size: 0.9rem;
}

.rank-row {
  display: grid;
  grid-template-columns: 80px 1fr 150px 150px;
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  align-items: center;
  transition: background 0.2s;
}

.rank-row:hover {
  background: rgba(0, 243, 255, 0.05);
}

.rank {
  color: #666;
  font-weight: bold;
  font-family: monospace;
  font-size: 1.2rem;
}

.name {
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
  letter-spacing: 1px;
}

.kills {
  color: #ff3333;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(255, 51, 51, 0.5);
}

.coins {
  color: #ffd700;
  text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
}

.top3 .rank {
  color: var(--primary);
  text-shadow: 0 0 5px var(--primary);
  font-size: 1.4rem;
}

.top3 .name {
  color: var(--primary);
  text-shadow: 0 0 5px var(--primary);
}

/* Back Button Restyle */
.btn-secondary {
  border: 1px solid var(--primary-dim);
  background: transparent;
  color: var(--primary-dim);
  padding: 0.5rem 2rem;
  font-weight: bold;
  letter-spacing: 2px;
  transition: all 0.3s;
  cursor: pointer;
}

.btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: 0 0 10px rgba(0, 243, 255, 0.2);
}
</style>
