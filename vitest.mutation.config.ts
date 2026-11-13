// Configuração do Vitest usada exclusivamente pelo Stryker (sem testes de integração lentos ou jsdom).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/core/src/**/*.test.ts",
      "packages/modules/*/domain/**/*.test.ts",
      "packages/modules/*/slices/**/*.test.ts",
    ],
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    testTimeout: 15_000,
  },
});
