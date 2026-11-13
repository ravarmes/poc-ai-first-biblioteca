// Fronteiras verificadas no código (princípio II da constituição, ADR-0009, ADR-0015).
// Rode com `npm run deps:check`.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "modulo-so-pelo-public",
      comment: "Um módulo de negócio só importa outro pelo diretório public/ dele.",
      severity: "error",
      from: { path: "^packages/modules/([^/]+)/" },
      to: {
        path: "^packages/modules/([^/]+)/",
        pathNot: ["^packages/modules/$1/", "^packages/modules/[^/]+/public/"],
      },
    },
    {
      name: "dominio-puro-nao-importa-infra-ou-fatias",
      comment: "Clean Architecture: domain/ dentro de um módulo não importa infrastructure/, slices/ nem HTTP/SQL.",
      severity: "error",
      from: { path: "^packages/modules/([^/]+)/domain/" },
      to: {
        path: ["^packages/modules/$1/(infrastructure|slices)/", "^kysely$", "^hono$"],
      },
    },
    {
      name: "nucleo-nao-conhece-modulos",
      comment: "packages/core não depende de nenhum módulo nem de apps/.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^(packages/modules|apps)/" },
    },
    {
      name: "modulos-nao-conhecem-apps",
      comment: "Pacotes de domínio e infraestrutura não importam apps/.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "app-api-usa-modulo-pelo-public-ou-module",
      comment: "A composição em apps/api-node só importa module.ts ou public/ de cada módulo.",
      severity: "error",
      from: { path: "^apps/api-" },
      to: {
        path: "^packages/modules/[^/]+/",
        pathNot: ["^packages/modules/[^/]+/(public/|module\\.ts$)"],
      },
    },
    {
      name: "front-nao-importa-backend",
      comment: "O frontend React não importa packages/core, packages/modules nem apps/api-node.",
      severity: "error",
      from: { path: "^apps/web-" },
      to: { path: "^(packages/(core|modules)|apps/api-)" },
    },
    {
      name: "producao-nao-importa-teste",
      comment: "Código de produção não importa testes nem utilitários de teste.",
      severity: "error",
      from: { path: "^(apps|packages|tools)/", pathNot: "\\.test\\.(ts|tsx)$|/tests?/|/testing/" },
      to: { path: "\\.test\\.(ts|tsx)$|/tests?/|/testing/" },
    },
    {
      name: "sem-ciclos",
      comment: "Grafo acíclico entre arquivos e módulos.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist|scratch)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs"],
    },
  },
};
