-- Schema audit: trilha append-only (ADR-0012, ADR-0013, ADR-0016).
CREATE TABLE audit.events (
  id            uuid        PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  request_id    text        NOT NULL,
  actor_id      uuid,
  actor_role    text,
  action        text        NOT NULL,
  resource_type text        NOT NULL,
  resource_id   text,
  result        text        NOT NULL CHECK (result IN ('success', 'denied', 'error')),
  reason        text,
  changes       jsonb,
  trace_id      text
);

CREATE INDEX audit_events_id_desc_idx ON audit.events (id DESC);
CREATE INDEX audit_events_action_idx ON audit.events (action, id DESC);
CREATE INDEX audit_events_resource_idx ON audit.events (resource_type, resource_id, id DESC);

-- Módulos só inserem; apenas audit_reader lê (e ninguém altera ou apaga pela aplicação).
GRANT INSERT ON audit.events TO mod_auth, mod_catalog, mod_circulation, mod_notices, mod_config;
GRANT SELECT ON audit.events TO audit_reader;
