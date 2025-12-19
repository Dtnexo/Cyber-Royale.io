import { defineStore } from "pinia";
import { io } from "socket.io-client";

export const useSocketStore = defineStore("socket", {
  state: () => ({
    socket: null,
    isConnected: false,
    wasConnected: false, // Track if we were previously connected (to detect restart)
  }),
  actions: {
    initSocket() {
      if (this.socket) return; // Already initialized

      const socketUrl = import.meta.env.PROD
        ? window.location.origin
        : "http://localhost:3005";

      this.socket = io(socketUrl);

      this.socket.on("connect", () => {
        console.log("Socket connected:", this.socket.id);
        this.isConnected = true;

        // Auto-Reload trigger: If we were connected before, this is a RE-connection (likely restart)
        if (this.wasConnected) {
          console.log("Server Restart Detected. Reloading client...");
          window.location.reload();
        }

        this.wasConnected = true;
      });

      this.socket.on("disconnect", () => {
        console.log("Socket disconnected");
        this.isConnected = false;
      });
    },
    disconnectSocket() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.isConnected = false;
      }
    },
  },
});
