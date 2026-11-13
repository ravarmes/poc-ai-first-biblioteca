import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { checkMarkdownContent, extractMermaidBlocks, extractRelativeLinks, runDocsCheck } from "./check.ts";

describe("Validador de documentação (docs:check)", () => {
  test("extrai links relativos ignorando URLs externas, âncoras e blocos de código", () => {
    const md = [
      "Veja [ADR](docs/adr/README.md#indice) e [site](https://example.com).",
      "```md",
      "[falso](nao/existe.md)",
      "```",
    ].join("\n");
    expect(extractRelativeLinks(md)).toEqual(["docs/adr/README.md"]);
  });

  test("rejeita ponto e vírgula em sequenceDiagram Mermaid", () => {
    const md = "```mermaid\nsequenceDiagram\n  A->>B: passo 1; passo 2\n```";
    expect(extractMermaidBlocks(md)).toHaveLength(1);
    const issues = checkMarkdownContent("doc.md", md, process.cwd());
    expect(issues.some((i) => i.message.includes("sequenceDiagram"))).toBe(true);
  });

  test("toda a documentação do repositório passa sem links quebrados", () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    expect(runDocsCheck(repoRoot)).toEqual([]);
  });
});
