// Validador offline da documentação: links relativos em Markdown e regras de blocos Mermaid.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

export interface DocsIssue {
  readonly file: string;
  readonly message: string;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "scratch", ".git"]);

export function collectMarkdownFiles(rootDir: string): string[] {
  const result: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (extname(entry) === ".md") result.push(full);
    }
  }
  walk(rootDir);
  return result.sort();
}

function stripCodeFences(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

export function extractRelativeLinks(markdown: string): string[] {
  const clean = stripCodeFences(markdown);
  const links: string[] = [];
  const regex = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    const raw = match[1] ?? "";
    if (
      !raw ||
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("#") ||
      raw.startsWith("file://")
    ) {
      continue;
    }
    const target = raw.split("#")[0]?.split("?")[0] ?? "";
    if (target.length > 0) links.push(target);
  }
  return links;
}

export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

export function checkMarkdownContent(filePath: string, markdown: string, baseDir: string): DocsIssue[] {
  const issues: DocsIssue[] = [];
  for (const link of extractRelativeLinks(markdown)) {
    const resolved = resolve(baseDir, link);
    if (!existsSync(resolved)) {
      issues.push({ file: filePath, message: `link quebrado: ${link}` });
    }
  }
  for (const block of extractMermaidBlocks(markdown)) {
    const firstLine = block.trim().split(/\r?\n/)[0] ?? "";
    if (firstLine.startsWith("sequenceDiagram") && block.includes(";")) {
      issues.push({
        file: filePath,
        message: "bloco sequenceDiagram contém ';' (quebra o parser Mermaid conforme lição da PoC)",
      });
    }
  }
  return issues;
}

export function runDocsCheck(rootDir: string): DocsIssue[] {
  const files = collectMarkdownFiles(rootDir);
  const issues: DocsIssue[] = [];
  for (const full of files) {
    const content = readFileSync(full, "utf8");
    const rel = full.slice(rootDir.length + 1).replaceAll("\\", "/");
    issues.push(...checkMarkdownContent(rel, content, dirname(full)));
  }
  return issues;
}
