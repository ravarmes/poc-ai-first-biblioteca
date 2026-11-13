// @ts-check
// Teste de mutação (ADR-0028): avalia a força dos testes sobre regras de negócio e mediador.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  plugins: ["@stryker-mutator/vitest-runner"],
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  inPlace: false,
  vitest: {
    configFile: "vitest.mutation.config.ts",
  },
  mutate: [
    "packages/core/src/cursor.ts",
    "packages/core/src/ids.ts",
    "packages/core/src/http/problems.ts",
    "packages/core/src/mediator/mediator.ts",
    "packages/modules/*/domain/**/*.ts",
    "!packages/modules/**/*.test.ts",
    "packages/modules/*/slices/**/handler.ts",
  ],
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "scratch/mutation/mutation.html" },
  jsonReporter: { fileName: "scratch/mutation/mutation.json" },
  clearTextReporter: { allowColor: false, logTests: false, maxTestsToLog: 0 },
};
