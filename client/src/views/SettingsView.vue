<script setup>
import { ref, onMounted } from "vue";
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const router = useRouter();

const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const message = ref("");
const isError = ref(false);
const isLoading = ref(false);

onMounted(() => {
  if (auth.user) {
    username.value = auth.user.username;
  }
});

const handleSave = async () => {
  message.value = "";
  isError.value = false;

  if (password.value && password.value !== confirmPassword.value) {
    message.value = "Passwords do not match!";
    isError.value = true;
    return;
  }

  isLoading.value = true;
  const result = await auth.updateProfile({
    username: username.value,
    password: password.value,
  });
  isLoading.value = false;

  if (result.success) {
    message.value = "Settings updated successfully!";
    isError.value = false;
    // Clear password fields on success
    password.value = "";
    confirmPassword.value = "";
  } else {
    message.value = result.message;
    isError.value = true;
  }
};
</script>

<template>
  <div class="settings-page">
    <div class="bg-watermark right"></div>
    <div class="bg-watermark left"></div>

    <div class="container">
      <h2 class="section-title glitch-effect" data-text="SYSTEM SETTINGS">
        SYSTEM SETTINGS
      </h2>

      <div class="settings-panel">
        <div class="form-group">
          <label>OPERATIVE ID (USERNAME)</label>
          <input type="text" v-model="username" class="cyber-input" />
        </div>

        <div class="divider">
          <span class="divider-text">SECURITY PROTOCOLS</span>
        </div>

        <div class="form-group">
          <label>NEW ACCESS CODE (PASSWORD)</label>
          <input
            type="password"
            v-model="password"
            class="cyber-input"
            placeholder="Leave blank to keep current"
          />
        </div>

        <div class="form-group">
          <label>CONFIRM ACCESS CODE</label>
          <input
            type="password"
            v-model="confirmPassword"
            class="cyber-input"
            placeholder="Repeat new password"
          />
        </div>

        <div
          v-if="message"
          :class="['message-box', isError ? 'error' : 'success']"
        >
          {{ message }}
        </div>

        <div class="action-buttons">
          <button
            @click="router.push('/dashboard')"
            class="btn btn-secondary back-btn"
          >
            CANCEL // RETURN
          </button>
          <button
            @click="handleSave"
            class="btn btn-primary save-btn"
            :disabled="isLoading"
          >
            {{ isLoading ? "SAVING..." : "SAVE CONFIGURATION" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap");

.settings-page {
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
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
}

.container {
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 600px;
}

.section-title {
  font-family: "Orbitron", sans-serif;
  font-size: 3rem;
  font-weight: 900;
  letter-spacing: 6px;
  margin-bottom: 2rem;
  text-transform: uppercase;
  background: linear-gradient(180deg, #fff 0%, #b0b0b0 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 15px rgba(0, 243, 255, 0.4));
}

.settings-panel {
  background: rgba(10, 15, 30, 0.8);
  border: 1px solid rgba(0, 243, 255, 0.3);
  padding: 2.5rem;
  width: 100%;
  backdrop-filter: blur(20px);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);

  /* Cyber Corners */
  clip-path: polygon(
    20px 0,
    100% 0,
    100% calc(100% - 20px),
    calc(100% - 20px) 100%,
    0 100%,
    0 20px
  );
}

.form-group {
  margin-bottom: 1.5rem;
}

label {
  display: block;
  font-family: "Orbitron", sans-serif;
  color: #00f3ff;
  margin-bottom: 0.5rem;
  letter-spacing: 1px;
  font-size: 0.9rem;
}

.cyber-input {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  color: #fff;
  font-family: "Rajdhani", sans-serif;
  font-size: 1.1rem;
  outline: none;
  transition: all 0.3s;
}

.cyber-input:focus {
  border-color: #00f3ff;
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
}

.divider {
  display: flex;
  align-items: center;
  margin: 2rem 0;
  position: relative;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(0, 243, 255, 0.3);
}

.divider-text {
  padding: 0 1rem;
  color: rgba(255, 255, 255, 0.5);
  font-family: "Orbitron", sans-serif;
  font-size: 0.8rem;
}

.action-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.btn {
  flex: 1;
  padding: 1rem;
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  border: none;
  cursor: pointer;
  clip-path: polygon(
    15px 0,
    100% 0,
    100% calc(100% - 15px),
    calc(100% - 15px) 100%,
    0 100%,
    0 15px
  );
  transition: all 0.3s;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.back-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.7);
}

.back-btn:hover {
  border-color: #fff;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.save-btn {
  background: linear-gradient(135deg, #00f3ff 0%, #0066ff 100%);
  color: #000;
}

.save-btn:hover {
  filter: brightness(1.2);
  box-shadow: 0 0 20px rgba(0, 243, 255, 0.5);
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  filter: grayscale(1);
}

.message-box {
  padding: 1rem;
  margin-top: 1rem;
  border: 1px solid;
  text-align: center;
  font-family: "Rajdhani", sans-serif;
  font-weight: 700;
}

.message-box.success {
  background: rgba(0, 255, 0, 0.1);
  border-color: #00ff00;
  color: #00ff00;
}

.message-box.error {
  background: rgba(255, 0, 0, 0.1);
  border-color: #ff3333;
  color: #ff3333;
}

/* BACKGROUND WATERMARKS */
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
</style>
