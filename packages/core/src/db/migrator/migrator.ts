// Runner de migrations especificado em contracts/db/README.md (ADR-0018).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "kysely";
import type { ManagedDatabase } from "../database.ts";

export interface MigrationFile {
  readonly version: string;
  readonly name: string;
  readonly fileName: string;
  readonly content: string;
  readonly checksum: string;
}

export interface AppliedMigrationRecord {
  readonly version: string;
  readonly name: string;
  readonly checksum: string;
}

export interface AppliedMigrationResult {
  readonly version: string;
  readonly name: string;
  readonly executionMs: number;
}

export interface MigrationStatusReport {
  readonly applied: readonly string[];
  readonly pending: readonly string[];
  readonly errors: readonly string[];
}

const ADVISORY_LOCK_KEY = 20261110;
const MIGRATION_FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function loadMigrationsFromDir(migrationsDir: string): MigrationFile[] {
  let entries: string[];
  try {
    entries = readdirSync(migrationsDir).sort();
  } catch (err) {
    throw new Error(`não foi possível ler o diretório de migrations '${migrationsDir}': ${(err as Error).message}`);
  }

  const seenVersions = new Set<string>();
  const files: MigrationFile[] = [];

  for (const fileName of entries) {
    if (!fileName.endsWith(".sql")) continue;
    const match = MIGRATION_FILE_RE.exec(fileName);
    if (!match) {
      throw new Error(`nome de migration inválido: '${fileName}' (esperado NNNN_descricao.sql)`);
    }
    const version = match[1]!;
    const name = match[2]!;
    if (seenVersions.has(version)) {
      throw new Error(`versão duplicada '${version}' no diretório de migrations`);
    }
    seenVersions.add(version);

    const bytes = readFileSync(join(migrationsDir, fileName));
    files.push({
      version,
      name,
      fileName,
      content: bytes.toString("utf8"),
      checksum: sha256Hex(bytes),
    });
  }

  return files;
}

function validateAgainstApplied(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigrationRecord[],
): { pending: MigrationFile[]; errors: string[] } {
  const errors: string[] = [];
  const fileByVersion = new Map(files.map((f) => [f.version, f]));
  const appliedByVersion = new Map(applied.map((a) => [a.version, a]));

  let maxApplied = "";
  for (const record of applied) {
    if (record.version > maxApplied) maxApplied = record.version;
    const disk = fileByVersion.get(record.version);
    if (!disk) {
      errors.push(`migration ${record.version} (${record.name}) aplicada no banco está ausente no disco`);
      continue;
    }
    if (disk.checksum !== record.checksum) {
      errors.push(
        `checksum divergente na migration ${record.version} (${record.name}): esperado ${record.checksum}, encontrado ${disk.checksum}`,
      );
    }
  }

  const pending: MigrationFile[] = [];
  for (const file of files) {
    if (appliedByVersion.has(file.version)) continue;
    if (maxApplied && file.version <= maxApplied) {
      errors.push(`migration ${file.version} (${file.name}) está fora de ordem em relação à versão aplicada ${maxApplied}`);
      continue;
    }
    pending.push(file);
  }

  return { pending, errors };
}

export async function migrateDatabase(managed: ManagedDatabase, migrationsDir: string): Promise<AppliedMigrationResult[]> {
  const files = loadMigrationsFromDir(migrationsDir);
  const appliedResults: AppliedMigrationResult[] = [];

  await sql`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY})`.execute(managed.db);
  try {
    await managed.rawExec(`
      CREATE SCHEMA IF NOT EXISTS meta;
      CREATE TABLE IF NOT EXISTS meta.schema_migrations (
        version      text        PRIMARY KEY,
        name         text        NOT NULL,
        checksum     text        NOT NULL,
        applied_at   timestamptz NOT NULL DEFAULT now(),
        execution_ms integer     NOT NULL
      );
    `);

    const existingRows = await sql<AppliedMigrationRecord>`
      SELECT version, name, checksum FROM meta.schema_migrations ORDER BY version ASC
    `.execute(managed.db);

    const { pending, errors } = validateAgainstApplied(files, existingRows.rows);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    for (const file of pending) {
      const started = performance.now();
      await managed.db.transaction().execute(async (trx) => {
        await sql`SELECT set_config('search_path', 'public', true), set_config('lock_timeout', '5s', true)`.execute(trx);
        // Em PGlite, client.exec dentro da transação aberta usa a mesma sessão WASM.
        // Em pg em rede, sql.raw sem bind envia em comando único dentro da mesma conexão da tx.
        if (managed.pglite) {
          await managed.pglite.exec(file.content);
        } else {
          await sql.raw(file.content).execute(trx);
        }
        const executionMs = Math.max(0, Math.round(performance.now() - started));
        await sql`
          INSERT INTO meta.schema_migrations (version, name, checksum, execution_ms)
          VALUES (${file.version}, ${file.name}, ${file.checksum}, ${executionMs})
        `.execute(trx);
        appliedResults.push({ version: file.version, name: file.name, executionMs });
      });
    }
  } finally {
    await sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`.execute(managed.db).catch(() => undefined);
  }

  return appliedResults;
}

export async function getMigrationStatus(managed: ManagedDatabase, migrationsDir: string): Promise<MigrationStatusReport> {
  const files = loadMigrationsFromDir(migrationsDir);
  const existsRes = await sql<{ exists: boolean }>`
    SELECT to_regclass('meta.schema_migrations') IS NOT NULL AS exists
  `.execute(managed.db);

  if (!existsRes.rows[0]?.exists) {
    return {
      applied: [],
      pending: files.map((f) => f.version),
      errors: [],
    };
  }

  const existingRows = await sql<AppliedMigrationRecord>`
    SELECT version, name, checksum FROM meta.schema_migrations ORDER BY version ASC
  `.execute(managed.db);

  const { pending, errors } = validateAgainstApplied(files, existingRows.rows);
  return {
    applied: existingRows.rows.map((r) => r.version),
    pending: pending.map((f) => f.version),
    errors,
  };
}
