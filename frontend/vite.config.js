import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, /api is proxied to the FastAPI server, so no CORS setup is needed locally.
    proxy: { "/api": { target: process.env.VITE_DEV_API_TARGET || "http://127.0.0.1:8000", changeOrigin: true } },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/setupTests.js"] },
});
