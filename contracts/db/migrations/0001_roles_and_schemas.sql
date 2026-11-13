-- Roles de módulo, role de aplicação NOINHERIT e schemas isolados (ADR-0016, ADR-0017).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mod_auth') THEN
    CREATE ROLE mod_auth NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mod_catalog') THEN
    CREATE ROLE mod_catalog NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mod_circulation') THEN
    CREATE ROLE mod_circulation NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mod_notices') THEN
    CREATE ROLE mod_notices NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mod_config') THEN
    CREATE ROLE mod_config NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    CREATE ROLE audit_reader NOLOGIN;
  END IF;
END
$$;

GRANT mod_auth, mod_catalog, mod_circulation, mod_notices, mod_config, audit_reader TO app;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS circulation;
CREATE SCHEMA IF NOT EXISTS notices;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS audit;

GRANT USAGE ON SCHEMA auth TO mod_auth;
GRANT USAGE ON SCHEMA catalog TO mod_catalog;
GRANT USAGE ON SCHEMA circulation TO mod_circulation;
GRANT USAGE ON SCHEMA notices TO mod_notices;
GRANT USAGE ON SCHEMA config TO mod_config;
GRANT USAGE ON SCHEMA audit TO mod_auth, mod_catalog, mod_circulation, mod_notices, mod_config, audit_reader;

-- Tabelas mínimas do login da universidade (spec 001, ADR-0011).
CREATE TABLE auth.accounts (
  id                   uuid        PRIMARY KEY,
  email                text        NOT NULL UNIQUE,
  display_name         text        NOT NULL,
  role                 text        NOT NULL CHECK (role IN ('librarian', 'student')),
  student_registration text        UNIQUE,
  active               boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.sessions (
  id                   text        PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES auth.accounts(id),
  csrf_token           text        NOT NULL,
  role                 text        NOT NULL CHECK (role IN ('librarian', 'student')),
  display_name         text        NOT NULL,
  email                text        NOT NULL,
  student_registration text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON auth.sessions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.accounts TO mod_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.sessions TO mod_auth;
