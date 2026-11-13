// Composição do módulo Acervo: rotas HTTP públicas e rotas internas opcionais para modo separado.
import { BatchWorksRequestSchema } from "@biblioteca/contract";
import {
  type AnyDatabase,
  type ApiRouter,
  createServiceAuthMiddleware,
  type Mediator,
  parseInput,
  readJsonBody,
} from "@biblioteca/core";
import { createInProcessCatalogFacade } from "./public/index.ts";
import { registerCreateWorkEndpoint } from "./slices/create-work/endpoint.ts";
import { registerGetWorkEndpoint } from "./slices/get-work/endpoint.ts";
import { registerSearchWorksEndpoint } from "./slices/search-works/endpoint.ts";
import { registerUpdateWorkEndpoint } from "./slices/update-work/endpoint.ts";

export interface RegisterCatalogOptions {
  readonly internalServiceToken?: string;
}

export function registerCatalogModule(
  app: ApiRouter,
  mediator: Mediator,
  db: AnyDatabase,
  options: RegisterCatalogOptions = {},
): void {
  registerSearchWorksEndpoint(app, mediator);
  registerCreateWorkEndpoint(app, mediator);
  registerGetWorkEndpoint(app, mediator);
  registerUpdateWorkEndpoint(app, mediator);

  if (options.internalServiceToken) {
    const facade = createInProcessCatalogFacade(db);
    app.use("/internal/v1/catalog/*", createServiceAuthMiddleware(options.internalServiceToken));

    app.get("/internal/v1/catalog/works/:workId", async (c) => {
      const workId = c.req.param("workId");
      const work = await facade.getWork(workId);
      c.header("Cache-Control", "no-store");
      return c.json({ work });
    });

    app.post("/internal/v1/catalog/works/batch", async (c) => {
      const body = parseInput(BatchWorksRequestSchema, await readJsonBody(c));
      const map = await facade.getWorksByIds(body.ids);
      c.header("Cache-Control", "no-store");
      return c.json({ items: [...map.values()] });
    });
  }
}
