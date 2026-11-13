// Dialeto Kysely enxuto sobre @electric-sql/pglite com fila exclusiva para conexões em testes concorrentes.
import { PGlite } from "@electric-sql/pglite";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryCompiler,
  type QueryResult,
} from "kysely";

class PGliteConnection implements DatabaseConnection {
  readonly #client: PGlite;

  constructor(client: PGlite) {
    this.#client = client;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
    const res = await this.#client.query<R>(compiledQuery.sql, [...compiledQuery.parameters]);
    const affected = typeof res.affectedRows === "number" ? BigInt(res.affectedRows) : undefined;
    return {
      rows: res.rows,
      ...(affected !== undefined ? { numAffectedRows: affected } : {}),
    };
  }

  async *streamQuery<R>(_compiledQuery: CompiledQuery<unknown>): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("streamQuery não é suportado pelo adaptador PGlite");
  }
}

class PGliteDriver implements Driver {
  readonly #client: PGlite;
  readonly #connection: PGliteConnection;
  #queue: Promise<void> = Promise.resolve();
  #releaseCurrent: (() => void) | null = null;

  constructor(client: PGlite) {
    this.#client = client;
    this.#connection = new PGliteConnection(client);
  }

  async init(): Promise<void> {
    await this.#client.waitReady;
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    // PGlite executa sobre uma única instância WASM: serializamos o checkout da conexão como pool de tamanho 1
    // para que duas transações paralelas (ex.: Promise.all) não colidam com BEGIN/ROLLBACK simultâneos.
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.#releaseCurrent = release;
    return this.#connection;
  }

  async beginTransaction(connection: DatabaseConnection, settings: { isolationLevel?: string; accessMode?: string }): Promise<void> {
    const parts = ["BEGIN"];
    if (settings.isolationLevel) parts.push(`ISOLATION LEVEL ${settings.isolationLevel}`);
    if (settings.accessMode === "read only") parts.push("READ ONLY");
    await connection.executeQuery(CompiledQuery.raw(parts.join(" ")));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async releaseConnection(): Promise<void> {
    const release = this.#releaseCurrent;
    this.#releaseCurrent = null;
    if (release) release();
  }

  async destroy(): Promise<void> {
    await this.#client.close();
  }
}

export class PGliteDialect implements Dialect {
  readonly #client: PGlite;

  constructor(client: PGlite) {
    this.#client = client;
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createDriver(): Driver {
    return new PGliteDriver(this.#client);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }
}

export function createRawPGlite(dataDir?: string): PGlite {
  return dataDir && dataDir !== "memory" ? new PGlite(dataDir) : new PGlite();
}
