-- Schema catalog: acervo bibliográfico (spec 002, ADR-0005, ADR-0017).
CREATE TABLE catalog.works (
  id         uuid        PRIMARY KEY,
  title      text        NOT NULL,
  authors    jsonb       NOT NULL,
  subject    text        NOT NULL,
  isbn       text        UNIQUE,
  version    integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para busca local rápida sem serviço externo (ADR-0005, RNF-01).
CREATE INDEX works_title_lower_idx ON catalog.works (lower(title));
CREATE INDEX works_subject_lower_idx ON catalog.works (lower(subject));
CREATE INDEX works_search_tsv_idx ON catalog.works
  USING gin (to_tsvector('portuguese', title || ' ' || subject || ' ' || coalesce(isbn, '')));

GRANT SELECT, INSERT, UPDATE ON catalog.works TO mod_catalog;
