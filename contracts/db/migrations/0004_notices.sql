-- Schema notices: registros de envio de aviso por e-mail idempotente (spec 004, ADR-0008, ADR-0024).
CREATE TABLE notices.dispatches (
  id                   uuid        PRIMARY KEY,
  event_id             uuid        NOT NULL,
  hold_id              uuid        NOT NULL,
  work_id              uuid        NOT NULL,
  work_title           text        NOT NULL,
  student_id           uuid        NOT NULL,
  student_registration text        NOT NULL,
  recipient_email      text        NOT NULL,
  idempotency_key      text        NOT NULL UNIQUE,
  subject              text        NOT NULL,
  body                 text        NOT NULL,
  status               text        NOT NULL CHECK (status IN ('sent', 'skipped')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notices_student_id_idx ON notices.dispatches (student_registration, id DESC);

GRANT SELECT, INSERT ON notices.dispatches TO mod_notices;
