import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiProblemError } from "../api/http.ts";
import { useAuditEvents, useFineRate, useUpdateFineRateMutation } from "../api/queries.ts";
import { Card, formatBrlFromCents, formatDateTimePtBr, ProblemAlert, StatusBadge } from "../components/ui.tsx";
import { VersionConflictBanner } from "../components/version-conflict.tsx";

export function SettingsAndAuditPage() {
  const { t } = useTranslation();
  const fineRate = useFineRate();
  const updateFineRate = useUpdateFineRateMutation();

  const [centsInput, setCentsInput] = useState("100");
  const [editedVersion, setEditedVersion] = useState<number>(1);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const audit = useAuditEvents({
    action: actionFilter.trim() || undefined,
    result: resultFilter || undefined,
    cursor,
    limit: 20,
  });

  useEffect(() => {
    if (fineRate.data) {
      setCentsInput(String(fineRate.data.dailyRateCents));
      setEditedVersion(fineRate.data.version);
    }
  }, [fineRate.data]);

  function handleSaveRate(e: React.FormEvent) {
    e.preventDefault();
    setSavedBanner(null);
    const parsedCents = Number(centsInput);
    updateFineRate.mutate(
      { dailyRateCents: parsedCents, version: editedVersion },
      {
        onSuccess: (updated) => {
          setSavedBanner(
            `Valor diário atualizado para ${formatBrlFromCents(updated.dailyRateCents)} (versão v${updated.version}).`,
          );
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="Valor Diário da Multa (ADR-0007)"
        subtitle="Configuração editável sem novo deploy, com concorrência otimista por versão e auditoria atômica."
      >
        <div className="space-y-3">
          <VersionConflictBanner
            error={updateFineRate.error}
            isReloading={fineRate.isFetching}
            onReloadCurrent={() => {
              void fineRate.refetch();
              updateFineRate.reset();
            }}
          />
          {!(updateFineRate.error instanceof ApiProblemError && updateFineRate.error.isVersionConflict) ? (
            <ProblemAlert error={updateFineRate.error} onDismiss={() => updateFineRate.reset()} />
          ) : null}
          {savedBanner ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {savedBanner}
            </div>
          ) : null}

          {fineRate.data ? (
            <p className="text-sm text-slate-700">
              Tarifa vigente:{" "}
              <span className="font-semibold text-slate-900">{formatBrlFromCents(fineRate.data.dailyRateCents)}</span>{" "}
              ({fineRate.data.dailyRateCents} centavos/dia) • Versão atual:{" "}
              <span className="font-mono font-semibold">v{fineRate.data.version}</span>
            </p>
          ) : null}

          <form onSubmit={handleSaveRate} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="daily-rate-cents" className="block text-xs font-semibold text-slate-700">
                Novo valor diário (em centavos)
              </label>
              <input
                id="daily-rate-cents"
                type="number"
                min={1}
                max={100000}
                step={1}
                value={centsInput}
                onChange={(e) => setCentsInput(e.target.value)}
                className="mt-1 w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={updateFineRate.isPending}
              className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
            >
              {updateFineRate.isPending ? "Salvando..." : "Atualizar tarifa"}
            </button>
          </form>
        </div>
      </Card>

      <Card
        title="Trilha de Auditoria (audit.events)"
        subtitle="Leitura exclusiva sob papel audit_reader, ordenada da ocorrência mais recente à mais antiga."
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="audit-action-filter" className="block text-xs font-semibold text-slate-700">
              Filtrar por ação
            </label>
            <input
              id="audit-action-filter"
              type="text"
              value={actionFilter}
              onChange={(e) => {
                setCursor(undefined);
                setActionFilter(e.target.value);
              }}
              placeholder="ex.: fine_rate.updated"
              className="mt-1 w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="audit-result-filter" className="block text-xs font-semibold text-slate-700">
              Resultado
            </label>
            <select
              id="audit-result-filter"
              value={resultFilter}
              onChange={(e) => {
                setCursor(undefined);
                setResultFilter(e.target.value);
              }}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              <option value="success">Sucesso</option>
              <option value="denied">Negado</option>
              <option value="error">Erro</option>
            </select>
          </div>
        </div>

        <ProblemAlert error={audit.error} />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-600 uppercase">
              <tr>
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Ator</th>
                <th className="py-2 pr-3">Resultado</th>
                <th className="py-2">Alterações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {audit.data?.items.map((ev) => (
                <tr key={ev.id}>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">{formatDateTimePtBr(ev.occurredAt)}</td>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{ev.action}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{ev.actorRole ?? "sistema"}</td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={ev.result} label={t(`auditResult.${ev.result}`)} />
                  </td>
                  <td className="py-2.5 font-mono text-slate-600">
                    {ev.changes ? JSON.stringify(ev.changes) : (ev.reason ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {audit.data?.nextCursor ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setCursor(audit.data!.nextCursor!)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Carregar eventos anteriores
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
