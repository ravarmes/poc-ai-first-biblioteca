// Configuração do Vitest para todo o monorepo (backend Node + módulos + frontend jsdom via ambientes).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "backend-and-tools",
          environment: "node",
          include: [
            "tools/**/*.test.ts",
            "packages/**/*.test.ts",
            "apps/api-node/**/*.test.ts",
          ],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "web-react",
          environment: "jsdom",
          include: ["apps/web-react/src/**/*.test.{ts,tsx}"],
          setupFiles: ["apps/web-react/src/test-setup.ts"],
          testTimeout: 15_000,
        },
      },
    ],
  },
});
