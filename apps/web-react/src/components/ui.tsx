import type { ReactNode } from "react";
import { ApiProblemError } from "../api/http.ts";

export function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTimePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR");
}

const BADGE_VARIANTS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-900 border-emerald-300",
  "on-loan": "bg-amber-100 text-amber-900 border-amber-300",
  reserved: "bg-sky-100 text-sky-900 border-sky-300",
  retired: "bg-slate-200 text-slate-700 border-slate-300",
  open: "bg-indigo-100 text-indigo-900 border-indigo-300",
  returned: "bg-emerald-100 text-emerald-900 border-emerald-300",
  waiting: "bg-amber-100 text-amber-900 border-amber-300",
  ready: "bg-sky-100 text-sky-900 border-sky-300",
  fulfilled: "bg-emerald-100 text-emerald-900 border-emerald-300",
  expired: "bg-rose-100 text-rose-900 border-rose-300",
  pending: "bg-rose-100 text-rose-900 border-rose-300",
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300",
  success: "bg-emerald-100 text-emerald-900 border-emerald-300",
  denied: "bg-amber-100 text-amber-900 border-amber-300",
  error: "bg-rose-100 text-rose-900 border-rose-300",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls = BADGE_VARIANTS[status] ?? "bg-slate-100 text-slate-800 border-slate-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function Card({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ProblemAlert({ error, onDismiss }: { error: unknown; onDismiss?: () => void }) {
  if (!error) return null;
  if (error instanceof ApiProblemError) {
    const p = error.problem;
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {p.title} ({p.status})
            </p>
            {p.detail ? <p className="mt-1">{p.detail}</p> : null}
            {p.errors && p.errors.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {p.errors.map((fe, idx) => (
                  <li key={`${fe.field}-${idx}`}>
                    <span className="font-mono font-semibold">{fe.field}</span>: {fe.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {p.requestId ? (
              <p className="mt-1 text-xs text-rose-800">Código de rastreio: {p.requestId}</p>
            ) : null}
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded px-2 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
            >
              Fechar
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950">
      {error instanceof Error ? error.message : "Ocorreu um erro inesperado."}
    </div>
  );
}
