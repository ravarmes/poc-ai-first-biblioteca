import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import "./i18n/index.ts";
import { mockState } from "./mocks/handlers.ts";
import { LibraryApp } from "./router.tsx";

function renderApp(initialPath = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  render(<LibraryApp queryClient={qc} history={history} />);
}

describe("Frontend React da Biblioteca Universitária (MSW + Testing Library)", () => {
  test("[spec 001 [2.1]] [spec 002 [2.6]] login como bibliotecária, busca e cadastro de nova obra no acervo", async () => {
    const user = userEvent.setup();
    renderApp("/");

    expect(await screen.findByText(/Helena — Bibliotecária/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Helena — Bibliotecária/i }));

    expect(await screen.findByText("Domain-Driven Design")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Título da obra"), "Arquitetura Limpa");
    await user.type(screen.getByLabelText(/Autores/i), "Robert C. Martin");
    await user.type(screen.getByLabelText(/Assunto/i), "Engenharia de Software");
    await user.click(screen.getByRole("button", { name: "Cadastrar Obra" }));

    expect(await screen.findByText("Arquitetura Limpa")).toBeInTheDocument();
  });

  test("[spec 003 [5.5]] balcão empresta, devolve com multa gerada e quita a multa na ficha do aluno", async () => {
    const user = userEvent.setup();
    mockState.currentUser = {
      userId: "0193b2c0-0000-7000-8000-000000000001",
      role: "librarian",
      displayName: "Helena — Bibliotecária",
      email: "bibliotecaria@bib.edu.br",
      studentRegistration: null,
    };
    renderApp("/balcao");

    expect(await screen.findByText("Registrar Empréstimo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar Empréstimo" }));
    expect(await screen.findByText(/Empréstimo registrado para matrícula 2026-0001/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar Devolução" }));
    expect(await screen.findByText(/Multa gerada por 3 dia\(s\) de atraso/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Consultar matrícula" }));
    expect(await screen.findByRole("button", { name: "Quitar multa" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar multa" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Quitar multa" })).not.toBeInTheDocument();
    });
  });

  test("[spec 005 [2.4]] tela de multa trata 409 version-conflict com recarga segura e exibe trilha de auditoria", async () => {
    const user = userEvent.setup();
    mockState.currentUser = {
      userId: "0193b2c0-0000-7000-8000-000000000001",
      role: "librarian",
      displayName: "Helena — Bibliotecária",
      email: "bibliotecaria@bib.edu.br",
      studentRegistration: null,
    };
    mockState.forceConflictOnNextFineRatePatch = true;
    renderApp("/configuracoes-auditoria");

    expect(await screen.findByText(/Tarifa vigente:/i)).toBeInTheDocument();

    const rateInput = screen.getByLabelText("Novo valor diário (em centavos)");
    await user.clear(rateInput);
    await user.type(rateInput, "250");
    await user.click(screen.getByRole("button", { name: "Atualizar tarifa" }));

    expect(await screen.findByText(/Conflito de edição detectado/i)).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Recarregar dados atuais" }));

    await waitFor(() => {
      expect(screen.getByText(/Versão atual:/)).toHaveTextContent("v2");
    });

    await user.clear(rateInput);
    await user.type(rateInput, "300");
    await user.click(screen.getByRole("button", { name: "Atualizar tarifa" }));

    expect(await screen.findByText(/Valor diário atualizado para/i)).toBeInTheDocument();
    expect(await screen.findByText("fine_rate.updated")).toBeInTheDocument();
  });

  test("[spec 001 [2.5] [2.6]] botão Sair encerra sessão na tela, limpa cache e permite novo login em outro perfil", async () => {
    const user = userEvent.setup();
    renderApp("/balcao");

    expect(await screen.findByText(/Helena — Bibliotecária/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Helena — Bibliotecária/i }));
    expect(await screen.findByText("Registrar Empréstimo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Acesso Institucional")).toBeInTheDocument();
    expect(mockState.currentUser).toBeNull();
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ana Beatriz Silva/i }));
    expect(await screen.findByText(/Meus Empréstimos e Avisos/i)).toBeInTheDocument();
    expect(screen.queryByText(/Esta área é exclusiva da bibliotecária/i)).not.toBeInTheDocument();

    // Mesmo se a sessão tiver expirado antes no servidor (401 em /logout), Sair também retorna ao login
    mockState.currentUser = null;
    await user.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByText("Acesso Institucional")).toBeInTheDocument();
  });
});
