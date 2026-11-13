import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDevAccounts, useLoginMutation } from "../api/queries.ts";
import { ProblemAlert } from "../components/ui.tsx";

export function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("bibliotecaria@bib.edu.br");
  const devAccounts = useDevAccounts();
  const login = useLoginMutation();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(email);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-wider text-teal-800 uppercase">Acesso Institucional</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{t("appTitle")}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Informe seu e-mail institucional ou selecione um perfil de demonstração abaixo.
          </p>
        </div>

        <ProblemAlert error={login.error} />

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-800">
              E-mail institucional
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@bib.edu.br ou aluno@alu.edu.br"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
          >
            {login.isPending ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {devAccounts.data && devAccounts.data.items.length > 0 ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h2 className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
              Perfis rápidos de demonstração
            </h2>
            <div className="mt-3 grid gap-2">
              {devAccounts.data.items.map((acc) => (
                <button
                  key={acc.userId}
                  type="button"
                  disabled={login.isPending}
                  onClick={() => login.mutate(acc.email)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm hover:border-teal-600 hover:bg-teal-50/50"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{acc.displayName}</p>
                    <p className="text-xs text-slate-600">{acc.email}</p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-teal-900 ring-1 ring-slate-200">
                    {t(`roles.${acc.role}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
