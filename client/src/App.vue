<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useSocketStore } from "./stores/socket";

const socketStore = useSocketStore();

const preventZoomWheel = (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
  }
};

const preventZoomKeys = (e) => {
  // Explicitly allow Reset (0) on any layout
  if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
    return;
  }

  if (
    (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=")) ||
    e.key === "F11"
  ) {
    if (e.key !== "F11") e.preventDefault();
  }
};

// Active Zoom Reset
let zoomInterval = null;

// Initialize Socket Immediately
socketStore.initSocket();

const isZoomed = ref(false);
const debugInfo = ref("");
const triggerReason = ref("NONE");
let initialDPR = 1; // Will be set on mount

const checkZoom = () => {
  let zoomDetected = false;
  let scale = 1;
  let dpr = window.devicePixelRatio || 1;
  let reason = "";

  // Method 1: VisualViewport - MUST BE 1.0 (Absolute)
  if (window.visualViewport) {
    scale = window.visualViewport.scale;
    // Tightened tolerance: 0.8% margin instead of 2%
    if (Math.abs(scale - 1) > 0.008) {
      zoomDetected = true;
      reason = "BROWSER ZOOM";
    }
  }

  // Method 2: DPR Drift (Only if significantly changed from load)
  // Tightened tolerance: 1% margin instead of 20%
  if (Math.abs(dpr - initialDPR) > 0.01) {
    zoomDetected = true;
    reason += reason ? " + DPR" : "DPR";
  }

  isZoomed.value = zoomDetected;
  triggerReason.value = reason || "NONE";
  debugInfo.value = `Scale: ${scale.toFixed(3)} | DPR: ${dpr.toFixed(3)}`;
};

onMounted(() => {
  // Anti-Zoom Listeners
  window.addEventListener("wheel", preventZoomWheel, { passive: false });
  window.addEventListener("keydown", preventZoomKeys);

  // Set Initial DPR once on mount
  initialDPR = window.devicePixelRatio || 1;

  // Active Check
  window.addEventListener("resize", checkZoom);
  zoomInterval = setInterval(checkZoom, 500);

  checkZoom();
});

onUnmounted(() => {
  window.removeEventListener("wheel", preventZoomWheel);
  window.removeEventListener("keydown", preventZoomKeys);
  window.removeEventListener("resize", checkZoom);
  if (zoomInterval) clearInterval(zoomInterval);
});
</script>

<template>
  <!-- DEBUG INFO (Bottom Right) -->
  <div class="zoom-debug" v-if="triggerReason !== 'NONE'">
    {{ debugInfo }} | {{ triggerReason }}
  </div>

  <!-- Warning Overlay (Standard CSS, no !important on display) -->
  <div v-if="isZoomed" class="zoom-warning-overlay">
    <div class="warning-box">
      <h1>ZOOM DETECTED</h1>
      <p>UNAUTHORIZED VIEWPORT SCALE ({{ triggerReason }})</p>
      <div class="action-required">
        <p>YOU MUST RESET YOUR BROWSER ZOOM TO 100% TO PLAY</p>
        <p class="instruction">PRESS <span>CTRL + 0</span> NOW</p>
      </div>
      <div class="detected-stats">
        EXPECTED: 1.000 | DETECTED: {{ debugInfo }}
      </div>
    </div>
  </div>
  <router-view></router-view>
</template>

<style>
/* DEBUG INFO */
.zoom-debug {
  position: fixed;
  bottom: 5px;
  right: 5px;
  background: rgba(255, 0, 0, 0.8);
  color: #fff;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 10px;
  z-index: 999999;
  border: 1px solid #f00;
}

.action-required {
  border: 2px solid #ff3333;
  padding: 1.5rem;
  margin: 2rem 0;
  background: rgba(255, 0, 0, 0.1);
}

/* Global Zoom Warning Overlay */
.zoom-warning-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: #000 !important;
  z-index: 2147483647 !important; /* Max Int */
  display: flex;
  justify-content: center !important;
  align-items: center !important;
  font-family: "Orbitron", sans-serif;
  color: #ff3333;
}

.warning-box {
  text-align: center;
  border: 4px solid #ff3333;
  padding: 3rem;
  background: rgba(20, 0, 0, 0.95);
  box-shadow: 0 0 50px #ff3333;
  animation: pulse-border 1.5s infinite;
  max-width: 600px;
  width: 90%;
}

.warning-box h1 {
  font-size: 3rem;
  margin: 0 0 1rem 0;
  letter-spacing: 5px;
  text-shadow: 0 0 20px #ff0000;
}

.warning-box p {
  font-size: 1.2rem;
  color: #fff;
  margin-bottom: 1rem; /* Adjusted margin */
}

.instruction.sub {
  margin-top: 0.5rem;
  margin-bottom: 2rem;
}

.instruction span {
  background: #333;
  padding: 0.5rem 1rem;
  border: 1px solid #666;
  border-radius: 4px;
  color: #00f3ff;
  font-weight: bold;
}

.detected-stats {
  margin-top: 2rem;
  font-size: 1rem;
  color: #666;
  font-family: monospace;
}

@keyframes pulse-border {
  0% {
    box-shadow: 0 0 30px #ff3333;
    border-color: #ff3333;
  }
  50% {
    box-shadow: 0 0 60px #ff0000;
    border-color: #ff0000;
  }
  100% {
    box-shadow: 0 0 30px #ff3333;
    border-color: #ff3333;
  }
}

body {
  margin: 0;
  background: #000;
  color: #fff;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}
</style>
