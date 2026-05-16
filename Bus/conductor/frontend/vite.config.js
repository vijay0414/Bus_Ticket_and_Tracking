import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',                 // Listen on all network interfaces
    port: 5174,
    allowedHosts: true,              // Accept all hosts
    open: false,
    https: false                     // Disable HTTPS
  }
})
