<script setup>
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const router = useRouter();

const password = ref("");
const confirmPassword = ref("");
const message = ref("");
const isError = ref(false);
const isLoading = ref(false);

const handleSave = async () => {
  message.value = "";
  isError.value = false;

  if (!password.value) {
    message.value = "Password is required.";
    isError.value = true;
    return;
  }

  if (password.value !== confirmPassword.value) {
    message.value = "Passwords do not match!";
    isError.value = true;
    return;
  }

  isLoading.value = true;
  // Update profile with new password.
  // The backend will automatically clear the 'requiresReset' flag on success.
  const result = await auth.updateProfile({
    password: password.value,
  });
  isLoading.value = false;

  if (result.success) {
    message.value = "Security update complete. Initializing...";
    isError.value = false;

    // Slight delay for feedback before redirect
    setTimeout(() => {
      // Optimistically update local state if backend delay
      if (auth.user) auth.user.requiresReset = false;
      router.push("/dashboard");
    }, 1500);
  } else {
    message.value = result.message;
    isError.value = true;
  }
};
</script>

<template>
  <div class="reset-page">
    <div class="bg-watermark right"></div>
    <div class="bg-watermark left"></div>

    <div class="container">
      <h2 class="section-title glitch-effect" data-text="SECURITY ALERT">
        SECURITY ALERT
      </h2>

      <div class="reset-panel">
        <div class="alert-banner">🛑 MANDATORY UPDATE REQUIRED</div>

        <p class="description">
          Protocol Update: Your existing security credentials have expired due
          to a system upgrade.
          <br />
          You must set a new access code to proceed.
        </p>

        <div class="form-group">
          <label>NEW ACCESS CODE</label>
          <input
            type="password"
            v-model="password"
            class="cyber-input"
            placeholder="Enter new password"
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

        <button
          @click="handleSave"
          class="btn btn-primary save-btn"
          :disabled="isLoading"
        >
          {{ isLoading ? "UPDATING..." : "UPDATE CREDENTIALS" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@500;700&display=swap");

.reset-page {
  min-height: 100vh;
  background-color: #050000;
  background-image: radial-gradient(
    circle at 50% 50%,
    rgba(255, 0, 0, 0.1) 0%,
    transparent 60%
  );
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
  max-width: 500px;
}

.section-title {
  font-family: "Orbitron", sans-serif;
  font-size: 3rem;
  font-weight: 900;
  letter-spacing: 6px;
  margin-bottom: 2rem;
  text-transform: uppercase;
  color: #ff3333;
  text-shadow: 0 0 20px rgba(255, 51, 51, 0.6);
}

.reset-panel {
  background: rgba(20, 5, 5, 0.9);
  border: 1px solid #ff3333;
  padding: 2.5rem;
  width: 100%;
  backdrop-filter: blur(20px);
  box-shadow: 0 0 50px rgba(255, 0, 0, 0.2);
  clip-path: polygon(
    20px 0,
    100% 0,
    100% calc(100% - 20px),
    calc(100% - 20px) 100%,
    0 100%,
    0 20px
  );
  text-align: center;
}

.alert-banner {
  background: #ff3333;
  color: #000;
  font-weight: 900;
  font-family: "Orbitron";
  padding: 10px;
  margin-bottom: 20px;
  letter-spacing: 2px;
}

.description {
  color: #ccc;
  margin-bottom: 30px;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 1.5rem;
  text-align: left;
}

label {
  display: block;
  font-family: "Orbitron", sans-serif;
  color: #ff3333;
  margin-bottom: 0.5rem;
  letter-spacing: 1px;
  font-size: 0.9rem;
}

.cyber-input {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #552222;
  color: #fff;
  font-family: "Rajdhani", sans-serif;
  font-size: 1.1rem;
  outline: none;
  transition: all 0.3s;
}

.cyber-input:focus {
  border-color: #ff3333;
  box-shadow: 0 0 15px rgba(255, 51, 51, 0.2);
}

.save-btn {
  width: 100%;
  padding: 1rem;
  font-family: "Orbitron", sans-serif;
  font-weight: 700;
  border: none;
  cursor: pointer;
  background: #ff3333;
  color: #000;
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
  transition: all 0.3s;
  letter-spacing: 2px;
  font-size: 1.1rem;
  margin-top: 10px;
}

.save-btn:hover {
  background: #ff6666;
  box-shadow: 0 0 20px rgba(255, 51, 51, 0.5);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-box {
  padding: 1rem;
  margin-bottom: 1rem;
  border: 1px solid;
  text-align: center;
  font-weight: 700;
}

.message-box.error {
  background: rgba(255, 0, 0, 0.1);
  border-color: #ff3333;
  color: #ff3333;
}
.message-box.success {
  background: rgba(0, 255, 0, 0.1);
  border-color: #00ff00;
  color: #00ff00;
}

/* WATERMARKS */
.bg-watermark {
  position: absolute;
  opacity: 0.05;
  filter: blur(2px) grayscale(100%);
  pointer-events: none;
  z-index: 1;
}
</style>
