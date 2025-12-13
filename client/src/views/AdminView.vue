<script setup>
import { ref, onMounted } from "vue";
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";
import api from "../utils/axios";

const auth = useAuthStore();
const router = useRouter();

const stats = ref(null);
const users = ref([]);
const loading = ref(true);
const error = ref(null);

const fetchStats = async () => {
  try {
    const res = await api.get("/admin/stats");
    stats.value = res.data;
  } catch (e) {
    console.error(e);
  }
};

const fetchUsers = async () => {
  try {
    const res = await api.get("/admin/users");
    users.value = res.data;
  } catch (e) {
    error.value = "Failed to load users";
  }
};

const showModal = ref(false);
const selectedUser = ref(null);
const coinAmount = ref(1000);

const openCoinModal = (user) => {
  selectedUser.value = user;
  coinAmount.value = 1000;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  selectedUser.value = null;
};

const confirmGiveCoins = async () => {
  if (!selectedUser.value || !coinAmount.value) return;

  try {
    const res = await api.post(`/admin/user/${selectedUser.value.id}/coins`, {
      amount: parseInt(coinAmount.value),
    });
    alert(`Updated! New balance: ${res.data.newBalance}`);
    fetchUsers(); // Refresh
    closeModal();
  } catch (e) {
    alert("Error: " + (e.response?.data?.error || e.message));
  }
};

const giveCoins = (userId, username) => {
  // Legacy function override or unused if using template directly
};

onMounted(async () => {
  // Wait for auth to settle if refreshing
  if (!auth.user && auth.token) {
    await auth.fetchProfile();
  }

  if (!auth.user?.isAdmin) {
    router.push("/dashboard");
    return;
  }
  loading.value = true;
  await Promise.all([fetchStats(), fetchUsers()]);
  loading.value = false;
});
</script>

<template>
  <div class="admin-page">
    <div class="header">
      <h1 class="glitch-text">/// SECURE ADMIN CONSOLE ///</h1>
      <button @click="router.push('/dashboard')" class="btn-back">
        RETURN
      </button>
    </div>

    <div v-if="loading" class="loading">DECRYPTING...</div>
    <div v-else class="content">
      <!-- Stats Panel -->
      <div class="panel stats-panel" v-if="stats">
        <h2>SYSTEM STATUS</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <label>UPTIME</label>
            <span>{{ stats.uptime.toFixed(0) }}s</span>
          </div>
          <div class="stat-item">
            <label>USERS</label>
            <span>{{ stats.userCount }}</span>
          </div>
          <div class="stat-item">
            <label>HEROES</label>
            <span>{{ stats.heroCount }}</span>
          </div>
          <div class="stat-item">
            <label>ECONOMY</label>
            <span>{{ stats.totalCoins }} 🪙</span>
          </div>
        </div>
      </div>

      <!-- Users Panel -->
      <div class="panel users-panel">
        <h2>USER DATABASE</h2>
        <table>
          <thead>
            <tr>
              <th>USER</th>
              <th>EMAIL</th>
              <th>COINS</th>
              <th>ADMIN</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ admin: u.isAdmin }">
              <td>{{ u.username }}</td>
              <td>{{ u.email }}</td>
              <td>{{ u.coins }}</td>
              <td>{{ u.isAdmin ? "YES" : "NO" }}</td>
              <td>
                <button @click="openCoinModal(u)" class="btn-action">
                  💰 GRANT
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Grant Coins Modal -->
    <div v-if="showModal" class="modal-overlay">
      <div class="modal">
        <h3>GRANT FUNDS</h3>
        <p>
          Transferring to: <strong>{{ selectedUser?.username }}</strong>
        </p>

        <div class="input-group">
          <label>AMOUNT</label>
          <input type="number" v-model="coinAmount" step="100" />
        </div>

        <div class="modal-actions">
          <button @click="closeModal" class="btn-cancel">CANCEL</button>
          <button @click="confirmGiveCoins" class="btn-confirm">
            CONFIRM TRANSFER
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: #001122;
  border: 2px solid #00f3ff;
  padding: 2rem;
  width: 400px;
  color: #fff;
  box-shadow: 0 0 20px #00f3ff;
  text-align: center;
}

.modal h3 {
  color: #00f3ff;
  margin-top: 0;
}

.input-group {
  margin: 1.5rem 0;
  text-align: left;
}

.input-group label {
  display: block;
  color: #888;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

.input-group input {
  width: 100%;
  padding: 0.8rem;
  background: #000;
  border: 1px solid #333;
  color: #fff;
  font-family: inherit;
  font-size: 1.2rem;
}
.input-group input:focus {
  outline: none;
  border-color: #00f3ff;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

button {
  flex: 1;
  padding: 0.8rem;
  cursor: pointer;
  font-weight: bold;
  font-family: inherit;
  border: none;
}

.btn-cancel {
  background: #333;
  color: #888;
}
.btn-cancel:hover {
  background: #444;
  color: #fff;
}

.btn-confirm {
  background: #00f3ff;
  color: #000;
}
.btn-confirm:hover {
  background: #fff;
  box-shadow: 0 0 10px #00f3ff;
}
.admin-page {
  padding: 2rem;
  background: #050505;
  color: #00f3ff;
  min-height: 100vh;
  font-family: "Courier New", monospace;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid #00f3ff;
  padding-bottom: 1rem;
}

.glitch-text {
  font-size: 2rem;
  text-shadow: 2px 0 #ff00ff;
}

.btn-back {
  background: transparent;
  border: 1px solid #ff00ff;
  color: #ff00ff;
  padding: 0.5rem 1rem;
  cursor: pointer;
}
.btn-back:hover {
  background: #ff00ff;
  color: #000;
}

.panel {
  border: 1px solid #333;
  padding: 1rem;
  margin-bottom: 2rem;
  background: rgba(0, 20, 40, 0.5);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  background: #000;
  padding: 1rem;
  border: 1px solid #00f3ff;
}

.stat-item label {
  font-size: 0.8rem;
  color: #888;
}
.stat-item span {
  font-size: 1.5rem;
  font-weight: bold;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}

th,
td {
  text-align: left;
  padding: 0.8rem;
  border-bottom: 1px solid #333;
}

th {
  color: #888;
}

tr.admin {
  color: #ff00ff;
}

.btn-action {
  background: #00f3ff;
  color: #000;
  border: none;
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  font-weight: bold;
}
.btn-action:hover {
  background: #fff;
}
</style>
