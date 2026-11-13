# ADR-0011: Sessão e contexto de autenticação HTTP

- **Status**: Aceita (adaptada da SenseUp ADR-0012 / ADR-0021)
- **Data**: 2026-11-10

## Contexto e problema

Em linha com a [ADR-0002](0002-login-da-universidade.md), tanto o frontend React no navegador quanto chamadas diretas de API/testes automatizados precisam carregar uma identidade confiável e atualizada por requisição, sem confiar em campos `studentId` forjados no corpo quando a ação é do aluno.

## Decisão

- Suportar resolução do `Principal` por **cookie de sessão HTTP-only** (`lib_sid`, com proteção anti-CSRF via header `X-CSRF-Token` pareado ao cookie `lib_csrf` em métodos mutantes quando autenticado por cookie) e por cabeçalho `Authorization: Bearer <token>` (em integrações/testes).
- Não armazenar cache longo de papéis ou bloqueios no token: o autenticador resolve o usuário e vínculo atualizados a cada requisição.
- Disponibilizar rotas `/api/v1/auth/login`, `/api/v1/auth/logout`, `/api/v1/auth/dev-accounts` e `/api/v1/auth/me` para o login universitário simulado/local em dev (selecionando conta institucional de bibliotecária ou aluno matriculado) compatível com troca futura por OIDC real.

## Consequências

- Positivas: segurança consistente contra CSRF no navegador e ergonomia total para testes E2E/API e frontend React sem infraestrutura OIDC externa obrigatória.
- Negativas: requer envio do header `X-CSRF-Token` no cliente `http.ts` do React em requisições `POST`/`PATCH`.
