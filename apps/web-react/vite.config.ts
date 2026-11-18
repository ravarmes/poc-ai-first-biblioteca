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
// No container do Codespace, o Node 22 resolve "localhost" para ::1 (o /etc/hosts do Docker lista os dois), e o Vite
// escutaria só no IPv6, onde o encaminhamento de portas não chega: a página não abre. Lá, escuta em todos os endereços
// do container (só a porta encaminhada sai dele). Fora do Codespaces, fica o padrão do Vite: localhost, sem expor na rede.
const host = codespacesDomain ? true : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host, port, allowedHosts, proxy },
  // `npm run demo` serve o build pelo preview: mesma porta, mesmo repasse de /api para a API.
  preview: { host, port, strictPort: true, allowedHosts, proxy },
});
