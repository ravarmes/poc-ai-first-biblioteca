# ADR-0002: Login da universidade (OIDC / conta institucional)

- **Status**: Aceita
- **Data**: 2026-11-10
- **Contexto**: Fundação da Biblioteca (Encontro 1, slide 7).

## Contexto e problema

Alunos e bibliotecárias já possuem identidade institucional mantida pela universidade. Criar um sistema próprio de senhas duplicaria risco de segurança, recuperação de senha e desativação de contas quando um aluno se desliga.

## Decisão

Delegar a autenticação primária ao **provedor de identidade da universidade** (modelo compatível com OpenID Connect), mantendo na aplicação apenas o vínculo da identidade autenticada (`subject`, matrícula acadêmica e papel na biblioteca: `librarian` ou `student`).

Em ambiente local autônomo (sem servidor Keycloak externo obrigatório), a aplicação fornece um adaptador de sessão compatível com troca explícita de perfil institucional para desenvolvimento e testes automatizados, preservando a mesma interface `Authenticator` da composição.

## Consequências

- Positivas: zero armazenamento de senha de usuário no banco da biblioteca; separação limpa entre autenticar (identidade) e autorizar (papéis na biblioteca).
- Negativas: exige validação explícita do token/sessão a cada requisição e consulta à Secretaria na borda de Circulação.
