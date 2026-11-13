// Entidade Reserva (Hold) em fila FIFO com janela de 3 dias para retirada (spec 003, RN-06, RN-07).
import type { HoldStatus } from "@biblioteca/contract";
import { newUuidV7, ProblemError } from "@biblioteca/core";
import { addUtcDaysIso } from "./value-objects.ts";

export const HOLD_PICKUP_DAYS = 3;

export interface HoldProps {
  readonly id: string;
  readonly workId: string;
  readonly studentId: string;
  readonly assignedCopyId: string | null;
  readonly status: HoldStatus;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly version: number;
}

export class Hold {
  readonly #props: HoldProps;

  private constructor(props: HoldProps) {
    this.#props = props;
  }

  static place(input: { workId: string; studentId: string; nowIso: string }): Hold {
    return new Hold({
      id: newUuidV7(),
      workId: input.workId,
      studentId: input.studentId,
      assignedCopyId: null,
      status: "waiting",
      createdAt: input.nowIso,
      expiresAt: null,
      version: 1,
    });
  }

  static reconstitute(props: HoldProps): Hold {
    return new Hold(props);
  }

  get props(): HoldProps {
    return this.#props;
  }

  assignCopy(copyId: string, nowIso: string, pickupDays: number = HOLD_PICKUP_DAYS): Hold {
    if (this.#props.status !== "waiting") {
      throw new ProblemError("invalid-copy-state", {
        detail: "Apenas reservas aguardando na fila podem receber exemplar devolvido.",
      });
    }
    return new Hold({
      ...this.#props,
      assignedCopyId: copyId,
      status: "ready",
      expiresAt: addUtcDaysIso(nowIso, pickupDays),
      version: this.#props.version + 1,
    });
  }

  fulfill(expectedVersion: number, nowIso: string): Hold {
    if (this.#props.status !== "ready") {
      throw new ProblemError("invalid-copy-state", {
        detail: "A reserva não está pronta para retirada no balcão.",
      });
    }
    if (this.#props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "A reserva foi alterada em paralelo; recarregue os dados.",
        currentVersion: this.#props.version,
      });
    }
    if (this.#props.expiresAt !== null && Date.parse(nowIso) > Date.parse(this.#props.expiresAt)) {
      throw new ProblemError("hold-expired", {
        detail: "O prazo de 3 dias para retirada desta reserva já expirou; dê baixa antes de liberar o exemplar.",
      });
    }
    return new Hold({
      ...this.#props,
      status: "fulfilled",
      version: this.#props.version + 1,
    });
  }

  expire(expectedVersion: number, nowIso: string): Hold {
    if (this.#props.status !== "ready") {
      throw new ProblemError("invalid-copy-state", {
        detail: "Apenas reservas com exemplar aguardando retirada ('ready') podem receber baixa por expiração.",
      });
    }
    if (this.#props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "A reserva foi alterada em paralelo; recarregue os dados.",
        currentVersion: this.#props.version,
      });
    }
    if (this.#props.expiresAt !== null && Date.parse(nowIso) <= Date.parse(this.#props.expiresAt)) {
      throw new ProblemError("invalid-copy-state", {
        detail: "O prazo limite de 3 dias para retirada ainda está em vigor.",
      });
    }
    return new Hold({
      ...this.#props,
      status: "expired",
      version: this.#props.version + 1,
    });
  }
}
