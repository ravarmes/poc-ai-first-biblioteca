-- Schema config: valor diário da multa configurável em tabela (spec 005, ADR-0007).
CREATE TABLE config.fine_rates (
  id               text        PRIMARY KEY,
  daily_rate_cents integer     NOT NULL CHECK (daily_rate_cents >= 1),
  version          integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO config.fine_rates (id, daily_rate_cents, version)
VALUES ('default', 100, 1)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON config.fine_rates TO mod_config;
