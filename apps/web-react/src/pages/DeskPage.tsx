import type { ReturnCopyResultDto } from "@biblioteca/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiProblemError } from "../api/http.ts";
import {
  useExpireHoldMutation,
  useLendCopyMutation,
  useListCopies,
  usePayFineMutation,
  useRetireCopyMutation,
  useReturnCopyMutation,
  useStudentSummary,
  useWithdrawHoldMutation,
} from "../api/queries.ts";
import { Card, formatBrlFromCents, formatDateTimePtBr, ProblemAlert, StatusBadge } from "../components/ui.tsx";
import { VersionConflictBanner } from "../components/version-conflict.tsx";

export function DeskPage() {
  const { t } = useTranslation();

  // Empréstimo
  const [lendRegistration, setLendRegistration] = useState("2026-0001");
  const [lendBarcode, setLendBarcode] = useState("DDD-001");
  const [lendSuccess, setLendSuccess] = useState<string | null>(null);
  const lend = useLendCopyMutation();

  // Devolução
  const [returnBarcode, setReturnBarcode] = useState("DDD-001");
  const [returnResult, setReturnResult] = useState<ReturnCopyResultDto | null>(null);
  const returnCopy = useReturnCopyMutation();

  // Consulta de aluno no balcão
  const [lookupInput, setLookupInput] = useState("2026-0001");
  const [activeRegistration, setActiveRegistration] = useState("2026-0001");
  const summary = useStudentSummary(activeRegistration);
  const withdrawHold = useWithdrawHoldMutation();
  const expireHold = useExpireHoldMutation();
  const payFine = usePayFineMutation();

  // Lista de exemplares
  const copies = useListCopies({ limit: 30 });
  const retireCopy = useRetireCopyMutation();

  function handleLend(e: React.FormEvent) {
    e.preventDefault();
    setLendSuccess(null);
    lend.mutate(
      { studentRegistration: lendRegistration, barcode: lendBarcode },
      {
        onSuccess: (created) => {
          setLendSuccess(
            `Empréstimo registrado para matrícula ${created.studentRegistration} (${created.barcode}). Devolução prevista em ${created.dueDate}.`,
          );
          setActiveRegistration(created.studentRegistration);
          setLookupInput(created.studentRegistration);
        },
      },
    );
  }

  function handleReturn(e: React.FormEvent) {
    e.preventDefault();
    setReturnResult(null);
    returnCopy.mutate(returnBarcode, {
      onSuccess: (res) => {
        setReturnResult(res);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Registrar Empréstimo" subtitle="Prazo automático de 14 dias letivos + validação na Secretaria.">
          <ProblemAlert error={lend.error} onDismiss={() => lend.reset()} />
          {lendSuccess ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {lendSuccess}
            </div>
          ) : null}
          <form onSubmit={handleLend} className="space-y-3">
            <div>
              <label htmlFor="lend-ra" className="block text-xs font-semibold text-slate-700">
                Matrícula do aluno (ex.: 2026-0001)
              </label>
              <input
                id="lend-ra"
                type="text"
                required
                value={lendRegistration}
                onChange={(e) => setLendRegistration(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="lend-barcode" className="block text-xs font-semibold text-slate-700">
                Código de barras do exemplar
              </label>
              <input
                id="lend-barcode"
                type="text"
                required
                value={lendBarcode}
                onChange={(e) => setLendBarcode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={lend.isPending}
              className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
            >
              {lend.isPending ? "Emprestando..." : "Confirmar Empréstimo"}
            </button>
          </form>
        </Card>

        <Card title="Registrar Devolução" subtitle="Calcula multa atômica em caso de atraso e atende a fila de reservas.">
          <ProblemAlert error={returnCopy.error} onDismiss={() => returnCopy.reset()} />
          <form onSubmit={handleReturn} className="space-y-3">
            <div>
              <label htmlFor="return-barcode" className="block text-xs font-semibold text-slate-700">
                Código de barras devolvido
              </label>
              <input
                id="return-barcode"
                type="text"
                required
                value={returnBarcode}
                onChange={(e) => setReturnBarcode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={returnCopy.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {returnCopy.isPending ? "Devolvendo..." : "Registrar Devolução"}
            </button>
          </form>

          {returnResult ? (
            <div className="mt-4 space-y-2 rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-sm text-teal-950">
              <p className="font-semibold">
                Devolução concluída: {returnResult.copy.barcode} ({t(`copyStatus.${returnResult.copy.status}`)})
              </p>
              {returnResult.fine ? (
                <p className="text-rose-800">
                  Multa gerada por {returnResult.fine.overdueDays} dia(s) de atraso:{" "}
                  <span className="font-semibold">{formatBrlFromCents(returnResult.fine.amountCents)}</span>
                </p>
              ) : (
                <p>Sem multa por atraso.</p>
              )}
              {returnResult.assignedHold ? (
                <p className="text-sky-900">
                  Reserva promovida para matrícula{" "}
                  <span className="font-semibold">{returnResult.assignedHold.studentRegistration}</span> (aviso enviado;
                  expira em {formatDateTimePtBr(returnResult.assignedHold.expiresAt ?? "")}).
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Card
        title="Situação do Aluno no Balcão"
        subtitle="Consulte empréstimos em aberto, retire/expire reservas e quite multas."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setActiveRegistration(lookupInput.trim());
          }}
          className="mb-4 flex flex-wrap gap-2"
        >
          <label htmlFor="lookup-ra" className="sr-only">
            Matrícula para consulta
          </label>
          <input
            id="lookup-ra"
            type="text"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="Matrícula (ex.: 2026-0001)"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
          >
            Consultar matrícula
          </button>
        </form>

        <ProblemAlert error={summary.error} />
        <VersionConflictBanner
          error={
            payFine.error instanceof ApiProblemError && payFine.error.isVersionConflict
              ? payFine.error
              : withdrawHold.error instanceof ApiProblemError && withdrawHold.error.isVersionConflict
                ? withdrawHold.error
                : expireHold.error
          }
          isReloading={summary.isFetching}
          onReloadCurrent={() => {
            void summary.refetch();
            payFine.reset();
            withdrawHold.reset();
            expireHold.reset();
          }}
        />
        {!(payFine.error instanceof ApiProblemError && payFine.error.isVersionConflict) ? (
          <ProblemAlert error={payFine.error} onDismiss={() => payFine.reset()} />
        ) : null}
        {!(withdrawHold.error instanceof ApiProblemError && withdrawHold.error.isVersionConflict) ? (
          <ProblemAlert error={withdrawHold.error} onDismiss={() => withdrawHold.reset()} />
        ) : null}
        {!(expireHold.error instanceof ApiProblemError && expireHold.error.isVersionConflict) ? (
          <ProblemAlert error={expireHold.error} onDismiss={() => expireHold.reset()} />
        ) : null}

        {summary.data ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm">
              <span className="font-semibold text-slate-900">{summary.data.name}</span> ({summary.data.registration}) •{" "}
              {summary.data.email} • Empréstimos ativos: {summary.data.activeLoansCount}/{summary.data.loanLimit}
            </div>

            {summary.data.holds.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Reservas</h3>
                <div className="space-y-2">
                  {summary.data.holds.map((hold) => (
                    <div
                      key={hold.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <div>
                        <span className="font-semibold">{hold.workTitle}</span>{" "}
                        {hold.assignedBarcode ? <span className="font-mono text-xs">({hold.assignedBarcode})</span> : null}
                        {hold.expiresAt ? (
                          <span className="ml-2 text-xs text-slate-600">
                            Limite: {formatDateTimePtBr(hold.expiresAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={hold.status} label={t(`holdStatus.${hold.status}`)} />
                        {hold.status === "ready" ? (
                          <>
                            <button
                              type="button"
                              disabled={withdrawHold.isPending || expireHold.isPending}
                              onClick={() => withdrawHold.mutate({ holdId: hold.id, version: hold.version })}
                              className="rounded bg-teal-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
                            >
                              Retirar reserva
                            </button>
                            <button
                              type="button"
                              disabled={withdrawHold.isPending || expireHold.isPending}
                              onClick={() => expireHold.mutate({ holdId: hold.id, version: hold.version })}
                              className="rounded border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                            >
                              Dar baixa (expirada)
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {summary.data.fines.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Multas</h3>
                <div className="space-y-2">
                  {summary.data.fines.map((fine) => (
                    <div
                      key={fine.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <span>
                        <span className="font-semibold">{formatBrlFromCents(fine.amountCents)}</span> ({fine.overdueDays}{" "}
                        dias em atraso)
                      </span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={fine.status} label={t(`fineStatus.${fine.status}`)} />
                        {fine.status === "pending" ? (
                          <button
                            type="button"
                            disabled={payFine.isPending}
                            onClick={() => payFine.mutate({ fineId: fine.id, version: fine.version })}
                            className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            Quitar multa
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card title="Exemplares Físicos Cadastrados" subtitle="Inventário com código de barras e baixa definitiva.">
        <div className="mb-3 space-y-2">
          <VersionConflictBanner
            error={retireCopy.error}
            isReloading={copies.isFetching}
            onReloadCurrent={() => {
              void copies.refetch();
              retireCopy.reset();
            }}
          />
          {!(retireCopy.error instanceof ApiProblemError && retireCopy.error.isVersionConflict) ? (
            <ProblemAlert error={retireCopy.error} onDismiss={() => retireCopy.reset()} />
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-600 uppercase">
              <tr>
                <th className="py-2 pr-3">Código de barras</th>
                <th className="py-2 pr-3">Obra</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {copies.data?.items.map((copy) => (
                <tr key={copy.id}>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{copy.barcode}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{copy.workTitle}</td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={copy.status} label={t(`copyStatus.${copy.status}`)} />
                  </td>
                  <td className="py-2.5">
                    {copy.status === "available" ? (
                      <button
                        type="button"
                        disabled={retireCopy.isPending}
                        onClick={() => retireCopy.mutate({ copyId: copy.id, version: copy.version })}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Dar baixa
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
