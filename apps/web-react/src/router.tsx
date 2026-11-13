import type { Principal } from "@biblioteca/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCurrentUser } from "./api/queries.ts";
import { AppShell } from "./components/app-shell.tsx";
import { CatalogPage } from "./pages/CatalogPage.tsx";
import { DeskPage } from "./pages/DeskPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { MyLoansPage } from "./pages/MyLoansPage.tsx";
import { SettingsAndAuditPage } from "./pages/SettingsAndAuditPage.tsx";

interface RouterContext {
  getPrincipal: () => Principal | undefined;
}

function AuthenticatedLayout() {
  const me = useCurrentUser();

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Verificando sessão...
      </div>
    );
  }

  if (!me.data) {
    return <LoginPage />;
  }

  return (
    <AppShell principal={me.data}>
      <Outlet />
    </AppShell>
  );
}

function RequireLibrarian({ children }: { children: (principal: Principal) => React.ReactNode }) {
  const me = useCurrentUser();
  if (!me.data) return null;
  if (me.data.role !== "librarian") {
    return (
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        Esta área é exclusiva da bibliotecária.
      </div>
    );
  }
  return <>{children(me.data)}</>;
}

export function createLibraryRouter(history: RouterHistory = createBrowserHistory()) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: AuthenticatedLayout,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => {
      const me = useCurrentUser();
      return me.data ? <CatalogPage principal={me.data} /> : null;
    },
  });

  const catalogRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/catalogo",
    component: () => {
      const me = useCurrentUser();
      return me.data ? <CatalogPage principal={me.data} /> : null;
    },
  });

  const myLoansRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/meus-emprestimos",
    component: () => {
      const me = useCurrentUser();
      return me.data ? <MyLoansPage principal={me.data} /> : null;
    },
  });

  const deskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/balcao",
    component: () => <RequireLibrarian>{() => <DeskPage />}</RequireLibrarian>,
  });

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/configuracoes-auditoria",
    component: () => <RequireLibrarian>{() => <SettingsAndAuditPage />}</RequireLibrarian>,
  });

  const routeTree = rootRoute.addChildren([indexRoute, catalogRoute, myLoansRoute, deskRoute, settingsRoute]);

  return createRouter({
    routeTree,
    history,
    context: {
      getPrincipal: () => undefined,
    },
  });
}

export function LibraryApp({
  queryClient: providedQueryClient,
  history: providedHistory,
}: {
  queryClient?: QueryClient;
  history?: RouterHistory;
}) {
  const [fallbackQueryClient] = useState(() =>
    providedQueryClient
      ? null
      : new QueryClient({
          defaultOptions: {
            queries: { staleTime: 5_000, retry: false },
          },
        }),
  );
  const [fallbackHistory] = useState(() => (providedHistory ? null : createBrowserHistory()));
  const queryClient = providedQueryClient ?? fallbackQueryClient!;
  const history = providedHistory ?? fallbackHistory!;
  const router = useMemo(() => createLibraryRouter(history), [history]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
