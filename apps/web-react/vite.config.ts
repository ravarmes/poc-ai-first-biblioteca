import { env } from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = env.API_PROXY_TARGET ?? env.VITE_API_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(env.VITE_PORT ?? "5173"),
    proxy: {
      "/api": apiProxyTarget,
      "/health": apiProxyTarget,
    },
  },
});
