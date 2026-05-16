import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',           // Listen on all network interfaces
    port: 5173,                // Local development port
    open: false,               // Don't auto-open in browser
    cors: true,                // Allow backend API/WebSocket requests
    allowedHosts: "all",       // Allow all hosts on your network
    https: false,              // Disable HTTPS
  },
  build: {
    outDir: "dist",            // Output folder for production build
    sourcemap: true            // Easier debugging in browser dev tools
  },
  resolve: {
    alias: {
      "@": "/src"              // Shortcut for imports
    }
  }
});
