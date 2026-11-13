import { resolve } from "node:path";
import { collectMarkdownFiles, runDocsCheck } from "./check.ts";

const rootDir = resolve(process.cwd());
const files = collectMarkdownFiles(rootDir);
const issues = runDocsCheck(rootDir);

if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`[docs-check] ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(`[docs-check] OK (${files.length} arquivos Markdown verificados, 0 problemas).`);
