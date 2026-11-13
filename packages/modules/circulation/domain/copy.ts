// Entidade Exemplar físico (Copy) e sua máquina de estados (spec 003, RN-02, RN-07).
import type { CopyStatus } from "@biblioteca/contract";
import { newUuidV7, ProblemError } from "@biblioteca/core";
import { Barcode } from "./value-objects.ts";

export interface CopyProps {
  readonly id: string;
  readonly workId: string;
  readonly barcode: Barcode;
  readonly status: CopyStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class Copy {
  readonly #props: CopyProps;

  private constructor(props: CopyProps) {
    this.#props = props;
  }

  static register(input: { workId: string; barcode: string }, nowIso: string): Copy {
    return new Copy({
      id: newUuidV7(),
      workId: input.workId,
      barcode: Barcode.of(input.barcode),
      status: "available",
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  static reconstitute(props: CopyProps): Copy {
    return new Copy(props);
  }

  get props(): CopyProps {
    return this.#props;
  }

  lend(nowIso: string): Copy {
    if (this.#props.status !== "available") {
      throw new ProblemError("invalid-copy-state", {
        detail: `O exemplar ${this.#props.barcode.value} está em estado '${this.#props.status}' e não pode ser emprestado diretamente.`,
      });
    }
    return new Copy({
      ...this.#props,
      status: "on-loan",
      version: this.#props.version + 1,
      updatedAt: nowIso,
    });
  }

  returnToPool(hasWaitingHold: boolean, nowIso: string): Copy {
    if (this.#props.status !== "on-loan") {
      throw new ProblemError("no-active-loan", {
        detail: `O exemplar ${this.#props.barcode.value} não está emprestado (estado atual: '${this.#props.status}').`,
      });
    }
    return new Copy({
      ...this.#props,
      status: hasWaitingHold ? "reserved" : "available",
      version: this.#props.version + 1,
      updatedAt: nowIso,
    });
  }

  withdrawFromReservation(nowIso: string): Copy {
    if (this.#props.status !== "reserved") {
      throw new ProblemError("invalid-copy-state", {
        detail: `O exemplar ${this.#props.barcode.value} precisa estar reservado para retirada.`,
      });
    }
    return new Copy({
      ...this.#props,
      status: "on-loan",
      version: this.#props.version + 1,
      updatedAt: nowIso,
    });
  }

  releaseReservation(hasNextWaitingHold: boolean, nowIso: string): Copy {
    if (this.#props.status !== "reserved") {
      throw new ProblemError("invalid-copy-state", {
        detail: `O exemplar ${this.#props.barcode.value} não está no estado reservado.`,
      });
    }
    return new Copy({
      ...this.#props,
      status: hasNextWaitingHold ? "reserved" : "available",
      version: this.#props.version + 1,
      updatedAt: nowIso,
    });
  }

  retire(expectedVersion: number, nowIso: string): Copy {
    if (this.#props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "O exemplar foi alterado por outra operação; recarregue antes de dar baixa.",
        currentVersion: this.#props.version,
      });
    }
    if (this.#props.status !== "available") {
      throw new ProblemError("invalid-copy-state", {
        detail: `Apenas exemplares disponíveis podem receber baixa definitiva (estado atual: '${this.#props.status}').`,
      });
    }
    return new Copy({
      ...this.#props,
      status: "retired",
      version: this.#props.version + 1,
      updatedAt: nowIso,
    });
  }
}
