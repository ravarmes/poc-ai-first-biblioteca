// Ponto de entrada HTTP da API da Biblioteca Universitária (ADR-0011, ADR-0015).
import { serve } from "@hono/node-server";
import { createLibraryApp } from "./composition.ts";

const port = Number(process.env.PORT ?? "3001");
const host = process.env.HOST ?? "127.0.0.1";

const instance = await createLibraryApp();

const server = serve({
  fetch: instance.app.fetch,
  port,
  hostname: host,
});

console.log(
  JSON.stringify({
    message: "API da Biblioteca Universitária em execução",
    url: `http://${host}:${port}`,
    modules: instance.activeModules,
  }),
);

async function shutdown(): Promise<void> {
  server.close();
  await instance.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
