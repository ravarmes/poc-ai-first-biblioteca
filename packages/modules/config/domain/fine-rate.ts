// Domínio da tabela de multa configurável (ADR-0007, spec 005 [1.1]-[1.5]).
import { ProblemError } from "@biblioteca/core";

export const DEFAULT_FINE_RATE_ID = "default";
export const DEFAULT_DAILY_RATE_CENTS = 100;
export const MIN_DAILY_RATE_CENTS = 1;
export const MAX_DAILY_RATE_CENTS = 100_000;

export interface FineRateProps {
  readonly id: string;
  readonly dailyRateCents: number;
  readonly version: number;
  readonly updatedAt: string;
}

export class FineRate {
  readonly props: FineRateProps;

  private constructor(props: FineRateProps) {
    this.props = props;
  }

  static reconstitute(props: FineRateProps): FineRate {
    return new FineRate(props);
  }

  static defaultSeed(nowIso: string = new Date().toISOString()): FineRate {
    return new FineRate({
      id: DEFAULT_FINE_RATE_ID,
      dailyRateCents: DEFAULT_DAILY_RATE_CENTS,
      version: 1,
      updatedAt: nowIso,
    });
  }

  updateDailyRate(
    newDailyRateCents: number,
    expectedVersion: number,
    nowIso: string = new Date().toISOString(),
  ): {
    readonly fineRate: FineRate;
    readonly changed: boolean;
    readonly before: number;
    readonly after: number;
  } {
    if (this.props.version !== expectedVersion) {
      throw new ProblemError("version-conflict", {
        detail: "O valor diário da multa foi alterado por outra pessoa; recarregue para continuar.",
        currentVersion: this.props.version,
      });
    }

    if (
      !Number.isInteger(newDailyRateCents) ||
      newDailyRateCents < MIN_DAILY_RATE_CENTS ||
      newDailyRateCents > MAX_DAILY_RATE_CENTS
    ) {
      throw new ProblemError("validation-error", {
        detail: "Valor diário da multa fora da faixa permitida.",
        errors: [
          {
            field: "dailyRateCents",
            message: `valor diário deve ser inteiro entre ${MIN_DAILY_RATE_CENTS} e ${MAX_DAILY_RATE_CENTS} centavos`,
          },
        ],
      });
    }

    if (newDailyRateCents === this.props.dailyRateCents) {
      return {
        fineRate: this,
        changed: false,
        before: this.props.dailyRateCents,
        after: this.props.dailyRateCents,
      };
    }

    return {
      changed: true,
      before: this.props.dailyRateCents,
      after: newDailyRateCents,
      fineRate: new FineRate({
        ...this.props,
        dailyRateCents: newDailyRateCents,
        version: this.props.version + 1,
        updatedAt: nowIso,
      }),
    };
  }
}
