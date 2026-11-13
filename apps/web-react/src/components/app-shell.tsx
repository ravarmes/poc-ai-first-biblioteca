import type { Principal } from "@biblioteca/contract";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLogoutMutation } from "../api/queries.ts";
import { ProblemAlert } from "./ui.tsx";

export function AppShell({ principal, children }: { principal: Principal; children: ReactNode }) {
  const { t } = useTranslation();
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        void navigate({ to: "/" });
      },
    });
  }

  const navItems = [
    { to: "/catalogo", label: t("nav.catalog"), show: true },
    { to: "/meus-emprestimos", label: t("nav.myLoans"), show: principal.role === "student" },
    { to: "/balcao", label: t("nav.desk"), show: principal.role === "librarian" },
    { to: "/configuracoes-auditoria", label: t("nav.settings"), show: principal.role === "librarian" },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-teal-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <h1 className="text-lg font-bold tracking-tight">{t("appTitle")}</h1>
            <p className="text-xs text-teal-100">{t("appSubtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <p className="font-semibold">{principal.displayName}</p>
              <p className="text-teal-200">
                {t(`roles.${principal.role}`)}
                {principal.studentRegistration ? ` • Matrícula ${principal.studentRegistration}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={logout.isPending}
              onClick={handleLogout}
              className="rounded-lg border border-teal-300/40 bg-teal-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {logout.isPending ? "Saindo..." : t("nav.logout")}
            </button>
          </div>
        </div>
        <nav aria-label="Navegação principal" className="bg-teal-950/60">
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2">
            {navItems.map((item) => {
              const active = pathname === item.to || (pathname === "/" && item.to === "/catalogo");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    active ? "bg-white text-teal-950 shadow-xs" : "text-teal-100 hover:bg-teal-800/70"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {logout.error ? (
          <div className="mb-4">
            <ProblemAlert error={logout.error} onDismiss={logout.reset} />
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
