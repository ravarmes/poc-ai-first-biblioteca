import type { Principal } from "@biblioteca/contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiProblemError } from "../api/http.ts";
import { useListNotices, useRenewLoanMutation, useStudentSummary } from "../api/queries.ts";
import { Card, formatBrlFromCents, formatDateTimePtBr, ProblemAlert, StatusBadge } from "../components/ui.tsx";
import { VersionConflictBanner } from "../components/version-conflict.tsx";

export function MyLoansPage({ principal }: { principal: Principal }) {
  const { t } = useTranslation();
  const registration = principal.studentRegistration;
  const summary = useStudentSummary(registration);
  const notices = useListNotices({ studentRegistration: registration ?? undefined, limit: 20 });
  const renew = useRenewLoanMutation();
  const [renewFeedback, setRenewFeedback] = useState<string | null>(null);

  if (!registration) {
    return (
      <Card title="Área do Estudante">
        <p className="text-sm text-slate-600">
          Seu usuário não possui matrícula de estudante associada. Utilize o Balcão para consultar matrículas.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ProblemAlert error={summary.error} />

      <Card
        title="Meus Empréstimos Ativos"
        subtitle={
          summary.data
            ? `Aluno(a): ${summary.data.name} • Empréstimos ativos: ${summary.data.activeLoansCount} de ${summary.data.loanLimit}`
            : "Carregando situação..."
        }
      >
        <div className="space-y-3">
          <VersionConflictBanner
            error={renew.error}
            isReloading={summary.isFetching}
            onReloadCurrent={() => {
              void summary.refetch();
              renew.reset();
            }}
          />
          {!(renew.error instanceof ApiProblemError && renew.error.isVersionConflict) ? (
            <ProblemAlert error={renew.error} onDismiss={() => renew.reset()} />
          ) : null}
          {renewFeedback ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {renewFeedback}
            </p>
          ) : null}

          {summary.data && summary.data.openLoans.length === 0 ? (
            <p className="text-sm text-slate-600">Você não possui empréstimos em aberto no momento.</p>
          ) : null}

          <div className="grid gap-3">
            {summary.data?.openLoans.map((loan) => (
              <div
                key={loan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3.5"
              >
                <div>
                  <p className="font-semibold text-slate-900">{loan.workTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Exemplar <span className="font-mono font-semibold">{loan.barcode}</span> • Emprestado em{" "}
                    {loan.loanDate} • Vencimento: <span className="font-semibold text-slate-900">{loan.dueDate}</span> •{" "}
                    Renovações: {loan.renewalsCount}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={loan.status} label={t(`loanStatus.${loan.status}`)} />
                  <button
                    type="button"
                    disabled={renew.isPending}
                    onClick={() => {
                      setRenewFeedback(null);
                      renew.mutate(
                        { loanId: loan.id, version: loan.version },
                        {
                          onSuccess: (updated) => {
                            setRenewFeedback(
                              `Empréstimo de ${updated.workTitle} renovado com sucesso até ${updated.dueDate}.`,
                            );
                          },
                        },
                      );
                    }}
                    className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
                  >
                    Renovar (+14 dias letivos)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Minhas Reservas">
          {summary.data && summary.data.holds.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhuma reserva registrada.</p>
          ) : (
            <ul className="space-y-2.5">
              {summary.data?.holds.map((hold) => (
                <li key={hold.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{hold.workTitle}</span>
                    <StatusBadge status={hold.status} label={t(`holdStatus.${hold.status}`)} />
                  </div>
                  {hold.assignedBarcode ? (
                    <p className="mt-1 text-xs text-slate-700">
                      Exemplar separado: <span className="font-mono font-semibold">{hold.assignedBarcode}</span>
                      {hold.expiresAt ? ` • Retirar até ${formatDateTimePtBr(hold.expiresAt)}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Minhas Multas">
          {summary.data && summary.data.fines.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhuma multa registrada.</p>
          ) : (
            <ul className="space-y-2.5">
              {summary.data?.fines.map((fine) => (
                <li key={fine.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{formatBrlFromCents(fine.amountCents)}</span>
                    <StatusBadge status={fine.status} label={t(`fineStatus.${fine.status}`)} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {fine.overdueDays} dia(s) de atraso • Tarifa vigente na devolução:{" "}
                    {formatBrlFromCents(fine.dailyRateCents)}/dia
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Avisos de Reserva Recebidos" subtitle="Notificações enviadas por e-mail após devolução de obras reservadas.">
        <ProblemAlert error={notices.error} />
        {notices.data && notices.data.items.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhum aviso recebido até o momento.</p>
        ) : (
          <ul className="space-y-2.5">
            {notices.data?.items.map((notice) => (
              <li key={notice.id} className="rounded-lg border border-slate-200 p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{notice.subject}</p>
                  <span className="text-xs text-slate-500">{formatDateTimePtBr(notice.createdAt)}</span>
                </div>
                <p className="mt-1 text-slate-700">{notice.body}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">Chave de idempotência: {notice.idempotencyKey}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
