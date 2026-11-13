// Componente obrigatório da ADR-0021 (Spec 005 [2.4]): alerta 409 version-conflict com recarga segura.
import { ApiProblemError } from "../api/http.ts";

export interface VersionConflictBannerProps {
  readonly error: unknown;
  readonly onReloadCurrent: () => void;
  readonly isReloading?: boolean;
}

export function VersionConflictBanner({ error, onReloadCurrent, isReloading = false }: VersionConflictBannerProps) {
  if (!(error instanceof ApiProblemError) || !error.isVersionConflict) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-amber-950"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Conflito de edição detectado (HTTP 409)</p>
          <p className="mt-1 text-sm">
            {error.problem.detail ?? "Este registro foi atualizado em outra aba ou por outra pessoa."}
            {error.problem.currentVersion !== undefined
              ? ` Versão atual no servidor: v${error.problem.currentVersion}.`
              : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={isReloading}
          onClick={onReloadCurrent}
          className="rounded-lg bg-amber-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:opacity-60"
        >
          {isReloading ? "Recarregando..." : "Recarregar dados atuais"}
        </button>
      </div>
    </div>
  );
}
