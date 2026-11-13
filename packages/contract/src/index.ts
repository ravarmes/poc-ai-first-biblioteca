// Fonte única de esquemas Zod e tipos DTO compartilhados com backend e frontend (ADR-0014).
// Todo corpo de escrita usa `.strict()` para rejeitar campos extras com 400 validation-error.
import { z } from "zod";

export const PROBLEM_CODES = [
  "validation-error",
  "unauthenticated",
  "forbidden",
  "csrf-invalid",
  "not-found",
  "method-not-allowed",
  "version-conflict",
  "isbn-taken",
  "barcode-taken",
  "student-inactive",
  "pending-fine",
  "loan-limit-reached",
  "invalid-copy-state",
  "no-active-loan",
  "copy-available-use-loan",
  "hold-already-exists",
  "hold-expired",
  "wrong-hold-student",
  "active-hold-blocks-renewal",
  "fine-already-paid",
  "service-unavailable",
  "internal-error",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];
export type ProblemType = `/problems/${ProblemCode}`;

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface Problem {
  readonly type: ProblemType;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly requestId?: string;
  readonly errors?: readonly FieldError[];
  readonly currentVersion?: number;
  readonly checks?: { readonly database: "up" | "down" };
}

export const IdSchema = z.string().uuid({ message: "identificador UUID inválido" });
export const TimestampSchema = z.string().datetime({ message: "data e hora ISO-8601 UTC inválidas" });
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data deve seguir AAAA-MM-DD");
export const StudentRegistrationSchema = z
  .string()
  .trim()
  .min(3, "matrícula deve ter pelo menos 3 caracteres")
  .max(32, "matrícula deve ter no máximo 32 caracteres")
  .regex(/^[A-Za-z0-9-]+$/, "matrícula aceita apenas letras, números e hífen");

export const BarcodeSchema = z
  .string()
  .trim()
  .min(4, "código de barras deve ter pelo menos 4 caracteres")
  .max(32, "código de barras deve ter no máximo 32 caracteres")
  .regex(/^[A-Za-z0-9-]+$/, "código de barras aceita apenas letras, números e hífen")
  .transform((v) => v.toUpperCase());

export const RoleSchema = z.enum(["librarian", "student"]);
export const CopyStatusSchema = z.enum(["available", "on-loan", "reserved", "retired"]);
export const LoanStatusSchema = z.enum(["open", "returned"]);
export const HoldStatusSchema = z.enum(["waiting", "ready", "fulfilled", "expired", "cancelled"]);
export const FineStatusSchema = z.enum(["pending", "paid"]);
export const NoticeStatusSchema = z.enum(["sent", "skipped"]);
export const AuditResultSchema = z.enum(["success", "denied", "error"]);

export type Role = z.infer<typeof RoleSchema>;
export type CopyStatus = z.infer<typeof CopyStatusSchema>;
export type LoanStatus = z.infer<typeof LoanStatusSchema>;
export type HoldStatus = z.infer<typeof HoldStatusSchema>;
export type FineStatus = z.infer<typeof FineStatusSchema>;
export type NoticeStatus = z.infer<typeof NoticeStatusSchema>;
export type AuditResult = z.infer<typeof AuditResultSchema>;

export const VersionInputSchema = z
  .object({
    version: z.number().int("versão deve ser inteira").min(1, "versão mínima é 1"),
  })
  .strict();

export const LimitQuerySchema = z.coerce
  .number()
  .int("limite deve ser inteiro")
  .min(1, "limite mínimo é 1")
  .max(100, "limite máximo é 100")
  .default(20);

export const CursorQuerySchema = z.string().min(1).max(512).optional();

export const PaginationQuerySchema = z
  .object({
    limit: LimitQuerySchema,
    cursor: CursorQuerySchema,
  })
  .strict();

// --- Auth & Health ---
export const PrincipalSchema = z.object({
  userId: IdSchema,
  role: RoleSchema,
  displayName: z.string(),
  email: z.string().email(),
  studentRegistration: StudentRegistrationSchema.nullable(),
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().trim().email("e-mail institucional inválido").max(160),
    password: z.string().max(128).optional(),
  })
  .strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResultSchema = z.object({
  principal: PrincipalSchema,
  accessToken: z.string(),
});
export type LoginResult = z.infer<typeof LoginResultSchema>;

export const DevAccountListSchema = z.object({
  items: z.array(PrincipalSchema),
});
export type DevAccountList = z.infer<typeof DevAccountListSchema>;

// --- Catalog ---
export const WorkSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(200),
  authors: z.array(z.string().min(1).max(120)).min(1),
  subject: z.string().min(1).max(120),
  isbn: z.string().nullable(),
  version: z.number().int().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type WorkDto = z.infer<typeof WorkSchema>;

export const CreateWorkRequestSchema = z
  .object({
    title: z.string().trim().min(1, "título é obrigatório").max(200, "título tem no máximo 200 caracteres"),
    authors: z
      .array(z.string().trim().min(1, "autor não pode ser vazio").max(120, "autor tem no máximo 120 caracteres"))
      .min(1, "informe ao menos um autor")
      .max(20, "máximo de 20 autores"),
    subject: z.string().trim().min(1, "assunto é obrigatório").max(120, "assunto tem no máximo 120 caracteres"),
    isbn: z.string().trim().min(10, "ISBN inválido").max(20, "ISBN inválido").nullable().optional(),
  })
  .strict();
export type CreateWorkRequest = z.infer<typeof CreateWorkRequestSchema>;

export const UpdateWorkRequestSchema = z
  .object({
    version: z.number().int().min(1),
    title: z.string().trim().min(1, "título é obrigatório").max(200, "título tem no máximo 200 caracteres").optional(),
    authors: z
      .array(z.string().trim().min(1).max(120))
      .min(1, "informe ao menos um autor")
      .max(20)
      .optional(),
    subject: z.string().trim().min(1, "assunto é obrigatório").max(120).optional(),
    isbn: z.string().trim().min(10).max(20).nullable().optional(),
  })
  .strict()
  .refine(
    (v) => v.title !== undefined || v.authors !== undefined || v.subject !== undefined || v.isbn !== undefined,
    { message: "informe ao menos um campo para atualizar", path: ["title"] },
  );
export type UpdateWorkRequest = z.infer<typeof UpdateWorkRequestSchema>;

export const SearchWorksQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    subject: z.string().trim().max(120).optional(),
    limit: LimitQuerySchema,
    cursor: CursorQuerySchema,
  })
  .strict();

export const WorkPageSchema = z.object({
  items: z.array(WorkSchema),
  nextCursor: z.string().nullable(),
});
export type WorkPageDto = z.infer<typeof WorkPageSchema>;

export const WorkIdParamsSchema = z.object({ workId: IdSchema }).strict();

// --- Internal Facade (Catalog Split Mode) ---
export const InternalWorkSummarySchema = z.object({
  id: IdSchema,
  title: z.string(),
  authors: z.array(z.string()),
  subject: z.string(),
  isbn: z.string().nullable(),
});
export type InternalWorkSummary = z.infer<typeof InternalWorkSummarySchema>;

export const BatchWorksRequestSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(100),
  })
  .strict();

// --- Circulation ---
export const CopySchema = z.object({
  id: IdSchema,
  workId: IdSchema,
  workTitle: z.string(),
  barcode: BarcodeSchema,
  status: CopyStatusSchema,
  version: z.number().int().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CopyDto = z.infer<typeof CopySchema>;

export const CopyIdParamsSchema = z.object({ copyId: IdSchema }).strict();
export const LoanIdParamsSchema = z.object({ loanId: IdSchema }).strict();
export const HoldIdParamsSchema = z.object({ holdId: IdSchema }).strict();
export const FineIdParamsSchema = z.object({ fineId: IdSchema }).strict();
export const StudentRegistrationParamsSchema = z.object({ registration: StudentRegistrationSchema }).strict();

export const ListCopiesQuerySchema = z
  .object({
    workId: IdSchema.optional(),
    status: CopyStatusSchema.optional(),
    limit: LimitQuerySchema,
    cursor: CursorQuerySchema,
  })
  .strict();

export const RegisterCopyRequestSchema = z
  .object({
    workId: IdSchema,
    barcode: BarcodeSchema,
  })
  .strict();
export type RegisterCopyRequest = z.infer<typeof RegisterCopyRequestSchema>;

export const WorkAvailabilitySchema = z.object({
  workId: IdSchema,
  totalCopies: z.number().int().min(0),
  availableCopies: z.number().int().min(0),
  onLoanCopies: z.number().int().min(0),
  reservedCopies: z.number().int().min(0),
  retiredCopies: z.number().int().min(0),
  waitingHolds: z.number().int().min(0),
  canPlaceHold: z.boolean(),
});
export type WorkAvailabilityDto = z.infer<typeof WorkAvailabilitySchema>;

export const LendCopyRequestSchema = z
  .object({
    studentRegistration: StudentRegistrationSchema,
    barcode: BarcodeSchema,
  })
  .strict();
export type LendCopyRequest = z.infer<typeof LendCopyRequestSchema>;

export const ReturnCopyRequestSchema = z
  .object({
    barcode: BarcodeSchema,
  })
  .strict();
export type ReturnCopyRequest = z.infer<typeof ReturnCopyRequestSchema>;

export const PlaceHoldRequestSchema = z
  .object({
    workId: IdSchema,
    studentRegistration: StudentRegistrationSchema.optional(),
  })
  .strict();
export type PlaceHoldRequest = z.infer<typeof PlaceHoldRequestSchema>;

export const LoanSchema = z.object({
  id: IdSchema,
  copyId: IdSchema,
  barcode: BarcodeSchema,
  workId: IdSchema,
  workTitle: z.string(),
  studentId: IdSchema,
  studentRegistration: StudentRegistrationSchema,
  loanDate: DateOnlySchema,
  dueDate: DateOnlySchema,
  returnedAt: DateOnlySchema.nullable(),
  renewalsCount: z.number().int().min(0),
  status: LoanStatusSchema,
  version: z.number().int().min(1),
});
export type LoanDto = z.infer<typeof LoanSchema>;

export const FineSchema = z.object({
  id: IdSchema,
  studentId: IdSchema,
  loanId: IdSchema,
  overdueDays: z.number().int().min(1),
  dailyRateCents: z.number().int().min(1),
  amountCents: z.number().int().min(1),
  status: FineStatusSchema,
  createdAt: TimestampSchema,
  paidAt: TimestampSchema.nullable(),
  version: z.number().int().min(1),
});
export type FineDto = z.infer<typeof FineSchema>;

export const HoldSchema = z.object({
  id: IdSchema,
  workId: IdSchema,
  workTitle: z.string(),
  studentId: IdSchema,
  studentRegistration: StudentRegistrationSchema,
  assignedCopyId: IdSchema.nullable(),
  assignedBarcode: BarcodeSchema.nullable(),
  status: HoldStatusSchema,
  createdAt: TimestampSchema,
  expiresAt: TimestampSchema.nullable(),
  version: z.number().int().min(1),
});
export type HoldDto = z.infer<typeof HoldSchema>;

export interface ReturnCopyResultDto {
  readonly loan: LoanDto;
  readonly copy: CopyDto;
  readonly fine: FineDto | null;
  readonly assignedHold: HoldDto | null;
}

export interface WithdrawHoldResultDto {
  readonly hold: HoldDto;
  readonly loan: LoanDto;
  readonly copy: CopyDto;
}

export interface ExpireHoldResultDto {
  readonly expiredHold: HoldDto;
  readonly copy: CopyDto;
  readonly promotedHold: HoldDto | null;
}

export interface StudentSummaryDto {
  readonly id: string;
  readonly registration: string;
  readonly name: string;
  readonly email: string;
  readonly activeLoansCount: number;
  readonly loanLimit: number;
  readonly openLoans: readonly LoanDto[];
  readonly holds: readonly HoldDto[];
  readonly fines: readonly FineDto[];
}

export interface CopyPageDto {
  readonly items: readonly CopyDto[];
  readonly nextCursor: string | null;
}

// --- Domain Event CopyReturned v1 ---
export const CopyReturnedEventV1Schema = z
  .object({
    eventId: IdSchema,
    schemaVersion: z.literal(1),
    occurredAt: TimestampSchema,
    copyId: IdSchema,
    barcode: BarcodeSchema,
    workId: IdSchema,
    workTitle: z.string().min(1),
    assignedHold: z
      .object({
        holdId: IdSchema,
        studentId: IdSchema,
        studentRegistration: StudentRegistrationSchema,
        recipientEmail: z.string().email(),
        expiresAt: TimestampSchema,
      })
      .nullable(),
  })
  .strict();
export type CopyReturnedEventV1 = z.infer<typeof CopyReturnedEventV1Schema>;

// --- Notices ---
export const ListNoticesQuerySchema = z
  .object({
    studentRegistration: StudentRegistrationSchema.optional(),
    limit: LimitQuerySchema,
    cursor: CursorQuerySchema,
  })
  .strict();

export interface NoticeDispatchDto {
  readonly id: string;
  readonly eventId: string;
  readonly holdId: string;
  readonly workId: string;
  readonly workTitle: string;
  readonly studentId: string;
  readonly studentRegistration: string;
  readonly recipientEmail: string;
  readonly idempotencyKey: string;
  readonly subject: string;
  readonly body: string;
  readonly status: NoticeStatus;
  readonly createdAt: string;
}

export interface NoticePageDto {
  readonly items: readonly NoticeDispatchDto[];
  readonly nextCursor: string | null;
}

// --- Config ---
export const UpdateFineRateRequestSchema = z
  .object({
    dailyRateCents: z
      .number()
      .int("valor diário deve ser inteiro em centavos")
      .min(1, "valor diário mínimo é 1 centavo")
      .max(100_000, "valor diário máximo é R$ 1.000,00"),
    version: z.number().int().min(1),
  })
  .strict();
export type UpdateFineRateRequest = z.infer<typeof UpdateFineRateRequestSchema>;

export interface FineRateConfigDto {
  readonly id: string;
  readonly dailyRateCents: number;
  readonly version: number;
  readonly updatedAt: string;
}

// --- Audit ---
export const ListAuditEventsQuerySchema = z
  .object({
    action: z
      .string()
      .max(64)
      .regex(/^[a-z0-9_]+\.[a-z0-9_]+$/, "ação inválida")
      .optional(),
    actorId: IdSchema.optional(),
    resourceType: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/, "tipo de recurso inválido")
      .optional(),
    resourceId: z.string().min(1).max(128).optional(),
    result: AuditResultSchema.optional(),
    from: TimestampSchema.optional(),
    to: TimestampSchema.optional(),
    limit: LimitQuerySchema,
    cursor: CursorQuerySchema,
  })
  .strict()
  .refine((q) => !(q.from && q.to && q.from >= q.to), {
    message: "parâmetro 'from' deve ser anterior a 'to'",
    path: ["from"],
  });

export interface AuditEventDto {
  readonly id: string;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly actorId: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly result: AuditResult;
  readonly reason: string | null;
  readonly changes: Record<string, unknown> | null;
}

export interface AuditEventPageDto {
  readonly items: readonly AuditEventDto[];
  readonly nextCursor: string | null;
}
