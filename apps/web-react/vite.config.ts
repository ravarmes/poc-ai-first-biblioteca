import { env } from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = env.API_PROXY_TARGET ?? env.VITE_API_TARGET ?? "http://127.0.0.1:3001";
const port = Number(env.VITE_PORT ?? "5173");
const proxy = {
  "/api": apiProxyTarget,
  "/health": apiProxyTarget,
};

// No Codespaces, o navegador chega pelo domínio de encaminhamento de portas (<codespace>-5173.app.github.dev),
// que o Vite recusa por padrão. Fora do Codespaces a variável não existe e vale o padrão do Vite (localhost e IPs).
const codespacesDomain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const allowedHosts = codespacesDomain ? [`.${codespacesDomain}`] : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port, allowedHosts, proxy },
  // `npm run demo` serve o build pelo preview: mesma porta, mesmo repasse de /api para a API.
  preview: { port, strictPort: true, allowedHosts, proxy },
});
