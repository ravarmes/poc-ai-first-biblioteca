import { decodeCursor, type PageResult, ProblemError, toPage } from "@biblioteca/core";
import type { WorkProps } from "../domain/work.ts";
import type { SearchWorksFilter, WorkRepository } from "../domain/work-repository.ts";

export class InMemoryWorkRepository implements WorkRepository {
  readonly items = new Map<string, WorkProps>();

  async insert(work: WorkProps): Promise<WorkProps> {
    if (work.isbn) {
      for (const existing of this.items.values()) {
        if (existing.isbn === work.isbn) {
          throw new ProblemError("isbn-taken", { detail: `Já existe obra com ISBN ${work.isbn}.` });
        }
      }
    }
    this.items.set(work.id, work);
    return work;
  }

  async updateWithVersion(work: WorkProps, expectedVersion: number): Promise<WorkProps> {
    const current = this.items.get(work.id);
    if (!current) {
      throw new ProblemError("not-found", { detail: "Obra não encontrada." });
    }
    if (current.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "Esta obra foi alterada por outra pessoa; recarregue para continuar.",
        currentVersion: current.version,
      });
    }
    if (work.isbn) {
      for (const existing of this.items.values()) {
        if (existing.id !== work.id && existing.isbn === work.isbn) {
          throw new ProblemError("isbn-taken", { detail: `Já existe obra com ISBN ${work.isbn}.` });
        }
      }
    }
    this.items.set(work.id, work);
    return work;
  }

  async findById(workId: string): Promise<WorkProps | null> {
    return this.items.get(workId) ?? null;
  }

  async findByIds(workIds: readonly string[]): Promise<WorkProps[]> {
    const wanted = new Set(workIds);
    return Array.from(this.items.values())
      .filter((w) => wanted.has(w.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  async search(filter: SearchWorksFilter): Promise<PageResult<WorkProps>> {
    const q = filter.q?.toLowerCase();
    const subject = filter.subject?.toLowerCase();
    const cursorId = filter.cursor ? decodeCursor(filter.cursor).id : undefined;

    const sorted = Array.from(this.items.values())
      .filter((w) => {
        if (q) {
          const matches =
            w.title.toLowerCase().includes(q) ||
            w.subject.toLowerCase().includes(q) ||
            (w.isbn?.toLowerCase().includes(q) ?? false) ||
            w.authors.some((a) => a.toLowerCase().includes(q));
          if (!matches) return false;
        }
        if (subject && !w.subject.toLowerCase().includes(subject)) return false;
        if (cursorId && w.id >= cursorId) return false;
        return true;
      })
      .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));

    return toPage(sorted, filter.limit + 1 - 1);
  }
}
