-- Schema circulation: cópia local de alunos, exemplares, empréstimos, multas e reservas (spec 003, ADR-0006, ADR-0017).
-- `work_id` guarda somente o identificador UUID da obra sem FK para `catalog.works` (ADR-0016).
CREATE TABLE circulation.students (
  id           uuid        PRIMARY KEY,
  registration text        NOT NULL UNIQUE,
  name         text        NOT NULL,
  email        text        NOT NULL,
  version      integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE circulation.copies (
  id         uuid        PRIMARY KEY,
  work_id    uuid        NOT NULL,
  barcode    text        NOT NULL UNIQUE,
  status     text        NOT NULL CHECK (status IN ('available', 'on-loan', 'reserved', 'retired')),
  version    integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copies_work_status_idx ON circulation.copies (work_id, status);

CREATE TABLE circulation.loans (
  id             uuid        PRIMARY KEY,
  copy_id        uuid        NOT NULL REFERENCES circulation.copies(id),
  student_id     uuid        NOT NULL REFERENCES circulation.students(id),
  work_id        uuid        NOT NULL,
  loan_date      text        NOT NULL,
  due_date       text        NOT NULL,
  returned_at    text,
  renewals_count integer     NOT NULL DEFAULT 0 CHECK (renewals_count >= 0),
  status         text        NOT NULL CHECK (status IN ('open', 'returned')),
  version        integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- No máximo um empréstimo aberto por exemplar físico (invariante de domínio garantida também no banco).
CREATE UNIQUE INDEX loans_one_open_per_copy_idx
  ON circulation.loans (copy_id)
  WHERE status = 'open';

CREATE INDEX loans_student_status_idx ON circulation.loans (student_id, status);
CREATE INDEX loans_work_status_idx ON circulation.loans (work_id, status);

CREATE TABLE circulation.fines (
  id               uuid        PRIMARY KEY,
  student_id       uuid        NOT NULL REFERENCES circulation.students(id),
  loan_id          uuid        NOT NULL REFERENCES circulation.loans(id),
  overdue_days     integer     NOT NULL CHECK (overdue_days >= 1),
  daily_rate_cents integer     NOT NULL CHECK (daily_rate_cents >= 1),
  amount_cents     integer     NOT NULL CHECK (amount_cents >= 1),
  status           text        NOT NULL CHECK (status IN ('pending', 'paid')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  version          integer     NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE INDEX fines_student_status_idx ON circulation.fines (student_id, status);

CREATE TABLE circulation.holds (
  id               uuid        PRIMARY KEY,
  work_id          uuid        NOT NULL,
  student_id       uuid        NOT NULL REFERENCES circulation.students(id),
  assigned_copy_id uuid        REFERENCES circulation.copies(id),
  status           text        NOT NULL CHECK (status IN ('waiting', 'ready', 'fulfilled', 'expired', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  version          integer     NOT NULL DEFAULT 1 CHECK (version >= 1)
);

-- Um aluno não pode ter duas reservas ativas (`waiting` ou `ready`) simultâneas para a mesma obra.
CREATE UNIQUE INDEX holds_one_active_per_student_work_idx
  ON circulation.holds (student_id, work_id)
  WHERE status IN ('waiting', 'ready');

-- Fila FIFO por obra (ordem por created_at, id).
CREATE INDEX holds_work_queue_idx ON circulation.holds (work_id, status, created_at, id);

GRANT SELECT, INSERT, UPDATE ON circulation.students TO mod_circulation;
GRANT SELECT, INSERT, UPDATE ON circulation.copies TO mod_circulation;
GRANT SELECT, INSERT, UPDATE ON circulation.loans TO mod_circulation;
GRANT SELECT, INSERT, UPDATE ON circulation.fines TO mod_circulation;
GRANT SELECT, INSERT, UPDATE ON circulation.holds TO mod_circulation;
