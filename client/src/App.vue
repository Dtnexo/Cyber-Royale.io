<script setup>
import { onMounted, onUnmounted } from "vue";

const preventZoomWheel = (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
  }
};

const preventZoomKeys = (e) => {
  if (
    (e.ctrlKey && (e.key === "+" || e.key === "-" || e.key === "=")) ||
    e.key === "F11"
  ) {
    if (e.key !== "F11") e.preventDefault();
  }
};

// Active Zoom Reset
const baseRatio =
  navigator.userAgent.indexOf("Firefox") === -1 ? window.devicePixelRatio : 1; // Firefox doesn't support zoom well

const maintainZoom = () => {
  if (navigator.userAgent.indexOf("Firefox") !== -1) return; // Skip Firefox
  const currentRatio = window.devicePixelRatio;
  const scale = baseRatio / currentRatio;
  document.body.style.zoom = scale;
};

onMounted(() => {
  window.addEventListener("wheel", preventZoomWheel, { passive: false });
  window.addEventListener("keydown", preventZoomKeys);
  window.addEventListener("resize", maintainZoom); // Check on resize

  // Initial Check
  maintainZoom();
});

onUnmounted(() => {
  window.removeEventListener("wheel", preventZoomWheel);
  window.removeEventListener("keydown", preventZoomKeys);
  window.removeEventListener("resize", maintainZoom);
});
</script>

<template>
  <router-view></router-view>
</template>

<style>
body {
  margin: 0;
  background: #000;
  color: #fff;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}
</style>
