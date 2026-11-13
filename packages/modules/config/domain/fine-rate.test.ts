import { ProblemError } from "@biblioteca/core";
import { describe, expect, test } from "vitest";
import { CONFIG_SCOPE } from "./fine-rate-repository.ts";
import { DEFAULT_FINE_RATE_ID, FineRate } from "./fine-rate.ts";

describe("Domínio de Configuração — FineRate (ADR-0007, spec 005)", () => {
  test("define CONFIG_SCOPE como mod_config no schema config e ID default", () => {
    expect(CONFIG_SCOPE).toEqual({ role: "mod_config", searchPath: "config" });
    expect(DEFAULT_FINE_RATE_ID).toBe("default");
  });

  test("[1.1] [1.2] inicia em 100 centavos/dia e incrementa versão ao alterar", () => {
    const rate = FineRate.defaultSeed("2026-11-10T10:00:00Z");
    expect(rate.props.id).toBe("default");
    expect(rate.props.dailyRateCents).toBe(100);
    expect(rate.props.version).toBe(1);

    const noop = rate.updateDailyRate(100, 1);
    expect(noop.changed).toBe(false);
    expect(noop.fineRate.props.version).toBe(1);

    const updated = rate.updateDailyRate(250, 1, "2026-11-10T11:00:00Z");
    expect(updated.changed).toBe(true);
    expect(updated.before).toBe(100);
    expect(updated.after).toBe(250);
    expect(updated.fineRate.props.version).toBe(2);
    expect(updated.fineRate.props.updatedAt).toBe("2026-11-10T11:00:00Z");
  });

  test("[1.3] rejeita versão defasada e limites fora de 1..100000 centavos inteiros com detalhes RFC 9457", () => {
    const rate = FineRate.defaultSeed();
    expect(() => rate.updateDailyRate(1, 1)).not.toThrow();
    expect(() => rate.updateDailyRate(100_000, 1)).not.toThrow();

    for (const invalid of [0, 100_001, 150.5]) {
      try {
        rate.updateDailyRate(invalid, 1);
        expect.fail(`Deveria rejeitar ${invalid}`);
      } catch (err) {
        expect(err).toBeInstanceOf(ProblemError);
        const p = err as ProblemError;
        expect(p.code).toBe("validation-error");
        expect(p.detail).toBe("Valor diário da multa fora da faixa permitida.");
        expect(p.errors).toEqual([
          { field: "dailyRateCents", message: "valor diário deve ser inteiro entre 1 e 100000 centavos" },
        ]);
      }
    }

    try {
      rate.updateDailyRate(200, 2);
      expect.fail("Deveria rejeitar versão 2");
    } catch (err) {
      const p = err as ProblemError;
      expect(p.code).toBe("version-conflict");
      expect(p.detail).toBe("O valor diário da multa foi alterado por outra pessoa; recarregue para continuar.");
      expect(p.currentVersion).toBe(1);
    }
  });
});
