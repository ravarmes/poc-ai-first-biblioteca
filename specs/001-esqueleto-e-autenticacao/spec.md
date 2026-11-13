# Especificação: Esqueleto, Sessão Universitária e Saúde do Serviço

**Pasta da fatia**: `specs/001-esqueleto-e-autenticacao/`
**Data**: 2026-11-10
**Status**: Implementada
**Módulo(s)**: `packages/core` · `packages/contract` · `apps/api-node` (`health`, `auth`) · `apps/web-react`

## Cenários de uso e critérios de aceite *(obrigatório)*

### História 1 — Verificar saúde do processo e prontidão do banco (Prioridade: P1)

**Ator**: Sistema / Monitoramento / Orquestrador
**Fluxo principal (Cockpit)**:
1. O cliente chama `GET /health/live` para confirmar que o servidor HTTP está em execução.
2. O sistema responde `200 OK` com `{ status: "live", modules }` e cabeçalho `X-Request-Id`.
3. O cliente chama `GET /health/ready` para confirmar que o banco PostgreSQL aceitou uma consulta `SELECT 1`.
4. O sistema responde `200 OK` com `{ status: "ready", checks: { database: "up" }, modules }`.

**Fluxos alternativos / exceções**:
- **3a.** Banco fora do ar ou consulta falha -> responde `503 Service Unavailable` no formato RFC 9457 (`type: "/problems/service-unavailable"`), com `checks: { database: "down" }` e sem vazar senha, host interno ou pilha de erro.
- **1a.** Cliente envia cabeçalho `X-Request-Id` válido (`^[A-Za-z0-9._-]{1,128}$`) -> API ecoa o mesmo valor na resposta; se inválido ou ausente, API gera um UUID novo.

**Por que esta prioridade**: garante que a fundação de contrato, rastreabilidade (`X-Request-Id`), RFC 9457 e conexão ao PostgreSQL esteja de pé antes dos módulos de negócio.
**Teste independente**: iniciar a API apontando para `PGlite` migrado e consultar `/health/live` e `/health/ready`; depois simular falha do pool e verificar `503 /problems/service-unavailable`.

**Critérios de aceite**:

- **[1.1]** **Dado** a API iniciada, **quando** o cliente chama `GET /health/live`, **então** recebe HTTP `200` com `{ status: "live", modules }` e header `X-Request-Id`.
- **[1.2]** **Dado** o banco PostgreSQL/PGlite migrado e acessível, **quando** o cliente chama `GET /health/ready`, **então** recebe HTTP `200` com `{ status: "ready", checks: { database: "up" }, modules }`.
- **[1.3]** **Dado** uma falha simulada na verificação do banco, **quando** o cliente chama `GET /health/ready`, **então** recebe HTTP `503` em `application/problem+json` com `type: "/problems/service-unavailable"` e `checks.database = "down"`.
- **[1.4]** **Dado** um `X-Request-Id` válido enviado pelo cliente vs. um `X-Request-Id` malformado (ex.: com espaços ou quebras de linha), **quando** uma rota é chamada, **então** no primeiro caso o header é ecoado e no segundo a API gera um identificador válido novo.

---

### História 2 — Autenticar no Login da Universidade, alternar perfis e encerrar sessão (Prioridade: P1)

**Ator**: Bibliotecária (`librarian`) ou Aluno (`student`)
**Fluxo principal (Cockpit)**:
1. O usuário abre a tela de login (ou seletor rápido em ambiente de demonstração) e seleciona ou informa seu e-mail institucional.
2. O sistema valida o formato do corpo (`LoginRequest` estrito via Zod), localiza a conta ativa em `auth.accounts`, cria uma sessão em `auth.sessions` (role `mod_auth`) e emite os cookies `lib_sid` (`HttpOnly`, `SameSite=Lax`) e `lib_csrf` para o navegador, além de retornar `accessToken` para clientes HTTP/testes e registrar `auth.login` na tabela `audit.events`.
3. O frontend consulta `GET /api/v1/auth/me` e exibe a área correspondente ao papel (`librarian` vê o Balcão e Configurações/Auditoria; `student` vê Catálogo e Meus Empréstimos).
4. Ao clicar em sair (`POST /api/v1/auth/logout` com cookie + `X-CSRF-Token`), a sessão é removida do servidor, os cookies são limpos e `auth.logout` é gravado na auditoria.

**Fluxos alternativos / exceções**:
- **1a.** E-mail desconhecido ou conta inativa (`active = false`) -> responde `401 /problems/unauthenticated` e grava `auth.login` com `result = "denied"`.
- **2a.** Pedido com campo extra no JSON ou e-mail inválido -> responde `400 /problems/validation-error` apontando o campo.
- **3a.** Chamada a qualquer rota `/api/v1/*` protegida sem cookie válido nem Bearer válido -> responde `401 /problems/unauthenticated`.
- **4a.** Mutação via cookie de sessão sem `X-CSRF-Token` ou com valor divergente do cookie `lib_csrf` -> responde `403 /problems/csrf-invalid` (ADR-0011).

**Por que esta prioridade**: separa de ponta a ponta os dois papéis definidos na ADR-0002 e ADR-0010 (`librarian` vs. `student`) e protege toda mutação futura no navegador.
**Teste independente**: autenticar uma bibliotecária e um aluno, validar `GET /api/v1/auth/me`, testar mutação autenticada por cookie sem `X-CSRF-Token` recebendo `403 /problems/csrf-invalid`, e encerrar a sessão verificando que o token antigo não funciona mais em `/api/v1/auth/me`.

**Critérios de aceite**:

- **[2.1]** **Dado** uma conta ativa (bibliotecária ou aluno), **quando** faz `POST /api/v1/auth/login` com `{ email }`, **então** recebe HTTP `200` com `principal` (`userId`, `role`, `displayName`, `email`, `studentRegistration`), `accessToken`, cookies `lib_sid` (`HttpOnly`) e `lib_csrf`, e grava evento `auth.login` com `result = "success"`.
- **[2.2]** **Dado** um e-mail inexistente ou conta com `active = false`, **quando** envia `POST /api/v1/auth/login`, **então** recebe HTTP `401 /problems/unauthenticated` sem criar sessão e grava `auth.login` (`result = "denied"`).
- **[2.3]** **Dado** uma requisição sem credencial ou com Bearer inválido a `GET /api/v1/auth/me`, **quando** processada, **então** recebe HTTP `401 /problems/unauthenticated`.
- **[2.4]** **Dado** uma sessão por cookie (`lib_sid` + `lib_csrf`), **quando** o cliente envia uma mutação (`POST`, `PATCH`, `DELETE`) sem `X-CSRF-Token` ou com token diferente do cookie `lib_csrf`, **então** recebe HTTP `403 /problems/csrf-invalid` antes de executar o handler.
- **[2.5]** **Dado** uma sessão ativa por cookie ou Bearer, **quando** chama `POST /api/v1/auth/logout` (com `X-CSRF-Token` válido no modo cookie), **então** a sessão deixa de existir no banco, `GET /api/v1/auth/me` com a mesma credencial passa a responder `401`, e `auth.logout` é gravado na auditoria.
- **[2.6]** **Dado** o aplicativo React aberto sem sessão, **quando** o usuário escolhe uma conta no seletor de perfis (`/api/v1/auth/dev-accounts`), **então** entra no sistema autenticado vendo seu papel e nome no cabeçalho.

### Casos de borda

- Campo desconhecido em `POST /api/v1/auth/login` -> `400 /problems/validation-error` (`additionalProperties: false` / `.strict()`).
- Rota `/api/v1/desconhecida` retorna `404 /problems/not-found` e método não mapeado retorna `405 /problems/method-not-allowed` em RFC 9457 (ADR-0014).

## Requisitos *(obrigatório)*

### Requisitos funcionais & Contrato da API

- Contrato definido em `contracts/openapi/paths/health.yaml` e `contracts/openapi/paths/auth.yaml`.
- Autenticação dual (cookie + CSRF no navegador; Bearer nos testes HTTP e integrações), conforme ADR-0011.
- Toda resposta de erro em formato RFC 9457 (`Content-Type: application/problem+json`) com `title` e `detail` em `pt-BR`.

### Regras de negócio, Auditoria e Telemetria

- Sessões em `auth.accounts` e `auth.sessions` são manipuladas apenas com a role `mod_auth`.
- Eventos auditados: `auth.login` (`success` e `denied`) e `auth.logout` (`success`).
- Nenhuma senha ou hash secreto de provedor trafega ou fica armazenado no repositório (ADR-0011).

## Critérios de sucesso *(obrigatório)*

- **CS-001**: Sonda `/health/ready`, fluxo completo `/api/v1/auth/login` -> `/api/v1/auth/me` -> bloqueio CSRF -> `/api/v1/auth/logout`, e runner SQL especificado passam integralmente em PostgreSQL real (`PGlite`).

## Fora do escopo

- Provedor OIDC/Keycloak externo em container separado (substituído pelo Login da Universidade local + seletor de perfis para demonstração).
