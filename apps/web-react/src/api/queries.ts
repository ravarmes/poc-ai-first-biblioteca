// Chaves de cache e hooks TanStack Query para toda a API HTTP da Biblioteca.
import type {
  AuditEventPageDto,
  CopyDto,
  CopyPageDto,
  CopyStatus,
  CreateWorkRequest,
  DevAccountList,
  ExpireHoldResultDto,
  FineDto,
  FineRateConfigDto,
  HoldDto,
  LendCopyRequest,
  LoanDto,
  LoginResult,
  NoticePageDto,
  PlaceHoldRequest,
  Principal,
  RegisterCopyRequest,
  ReturnCopyResultDto,
  StudentSummaryDto,
  UpdateFineRateRequest,
  UpdateWorkRequest,
  WithdrawHoldResultDto,
  WorkAvailabilityDto,
  WorkDto,
  WorkPageDto,
} from "@biblioteca/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiProblemError, apiRequest, buildQueryString } from "./http.ts";

export const queryKeys = {
  me: ["auth", "me"] as const,
  devAccounts: ["auth", "dev-accounts"] as const,
  works: (q?: string, subject?: string, cursor?: string) => ["catalog", "works", { q, subject, cursor }] as const,
  workAvailability: (workId: string) => ["circulation", "availability", workId] as const,
  copies: (workId?: string, status?: CopyStatus, cursor?: string) => ["circulation", "copies", { workId, status, cursor }] as const,
  studentSummary: (registration: string) => ["circulation", "student-summary", registration] as const,
  notices: (studentRegistration?: string, cursor?: string) => ["notices", { studentRegistration, cursor }] as const,
  fineRate: ["config", "fine-rate"] as const,
  auditEvents: (filters: Record<string, string | undefined>) => ["audit", "events", filters] as const,
};

export function useCurrentUser() {
  return useQuery<Principal | null>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await apiRequest<Principal>("/api/v1/auth/me");
      } catch (err) {
        if (err instanceof ApiProblemError && err.isUnauthenticated) {
          return null;
        }
        throw err;
      }
    },
    retry: (count, error) => !(error instanceof ApiProblemError && error.isUnauthenticated) && count < 1,
  });
}

export function useDevAccounts() {
  return useQuery({
    queryKey: queryKeys.devAccounts,
    queryFn: () => apiRequest<DevAccountList>("/api/v1/auth/dev-accounts"),
    retry: false,
  });
}

export function useLoginMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      apiRequest<LoginResult>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    onSuccess: (res) => {
      qc.removeQueries({
        predicate: (query) => !(query.queryKey[0] === "auth" && query.queryKey[1] === "me"),
      });
      qc.setQueryData<Principal | null>(queryKeys.me, res.principal);
      void qc.invalidateQueries({
        predicate: (query) => !(query.queryKey[0] === "auth" && query.queryKey[1] === "me"),
      });
    },
  });
}

export function useLogoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiRequest<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" });
      } catch (err) {
        if (err instanceof ApiProblemError && err.isUnauthenticated) {
          return { ok: true };
        }
        throw err;
      }
    },
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.setQueryData<Principal | null>(queryKeys.me, null);
      qc.removeQueries({
        predicate: (query) => !(query.queryKey[0] === "auth" && query.queryKey[1] === "me"),
      });
    },
  });
}

export function useSearchWorks(params: { q?: string; subject?: string; limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: queryKeys.works(params.q, params.subject, params.cursor),
    queryFn: () =>
      apiRequest<WorkPageDto>(
        `/api/v1/catalog/works${buildQueryString({
          q: params.q,
          subject: params.subject,
          limit: params.limit ?? 20,
          cursor: params.cursor,
        })}`,
      ),
  });
}

export function useWorkAvailability(workId: string) {
  return useQuery({
    queryKey: queryKeys.workAvailability(workId),
    queryFn: () => apiRequest<WorkAvailabilityDto>(`/api/v1/circulation/works/${workId}/availability`),
    enabled: Boolean(workId),
  });
}

export function useCreateWorkMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkRequest) =>
      apiRequest<WorkDto>("/api/v1/catalog/works", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog", "works"] });
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useUpdateWorkMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workId, ...body }: UpdateWorkRequest & { workId: string }) =>
      apiRequest<WorkDto>(`/api/v1/catalog/works/${workId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog", "works"] });
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useListCopies(params: { workId?: string; status?: CopyStatus; limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: queryKeys.copies(params.workId, params.status, params.cursor),
    queryFn: () =>
      apiRequest<CopyPageDto>(
        `/api/v1/circulation/copies${buildQueryString({
          workId: params.workId,
          status: params.status,
          limit: params.limit ?? 30,
          cursor: params.cursor,
        })}`,
      ),
  });
}

export function useRegisterCopyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterCopyRequest) =>
      apiRequest<CopyDto>("/api/v1/circulation/copies", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ["circulation", "copies"] });
      void qc.invalidateQueries({ queryKey: queryKeys.workAvailability(vars.workId) });
    },
  });
}

export function useRetireCopyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ copyId, version }: { copyId: string; version: number }) =>
      apiRequest<CopyDto>(`/api/v1/circulation/copies/${copyId}/retire`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useLendCopyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LendCopyRequest) =>
      apiRequest<LoanDto>("/api/v1/circulation/loans", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useReturnCopyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (barcode: string) =>
      apiRequest<ReturnCopyResultDto>("/api/v1/circulation/returns", {
        method: "POST",
        body: JSON.stringify({ barcode }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
      void qc.invalidateQueries({ queryKey: ["notices"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useRenewLoanMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ loanId, version }: { loanId: string; version: number }) =>
      apiRequest<LoanDto>(`/api/v1/circulation/loans/${loanId}/renew`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function usePlaceHoldMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PlaceHoldRequest) =>
      apiRequest<HoldDto>("/api/v1/circulation/holds", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workAvailability(vars.workId) });
      void qc.invalidateQueries({ queryKey: ["circulation", "student-summary"] });
    },
  });
}

export function useWithdrawHoldMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ holdId, version }: { holdId: string; version: number }) =>
      apiRequest<WithdrawHoldResultDto>(`/api/v1/circulation/holds/${holdId}/withdraw`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useExpireHoldMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ holdId, version }: { holdId: string; version: number }) =>
      apiRequest<ExpireHoldResultDto>(`/api/v1/circulation/holds/${holdId}/expire`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
      void qc.invalidateQueries({ queryKey: ["notices"] });
    },
  });
}

export function usePayFineMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fineId, version }: { fineId: string; version: number }) =>
      apiRequest<FineDto>(`/api/v1/circulation/fines/${fineId}/pay`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["circulation"] });
    },
  });
}

export function useStudentSummary(registration: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.studentSummary(registration ?? ""),
    queryFn: () =>
      apiRequest<StudentSummaryDto>(
        `/api/v1/circulation/students/${encodeURIComponent(registration!)}/summary`,
      ),
    enabled: Boolean(registration && registration.trim().length >= 3),
    retry: false,
  });
}

export function useListNotices(params: { studentRegistration?: string; limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: queryKeys.notices(params.studentRegistration, params.cursor),
    queryFn: () =>
      apiRequest<NoticePageDto>(
        `/api/v1/notices${buildQueryString({
          studentRegistration: params.studentRegistration,
          limit: params.limit ?? 20,
          cursor: params.cursor,
        })}`,
      ),
  });
}

export function useFineRate() {
  return useQuery({
    queryKey: queryKeys.fineRate,
    queryFn: () => apiRequest<FineRateConfigDto>("/api/v1/config/fine-rate"),
  });
}

export function useUpdateFineRateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateFineRateRequest) =>
      apiRequest<FineRateConfigDto>("/api/v1/config/fine-rate", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.fineRate, updated);
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useAuditEvents(filters: { action?: string; result?: string; cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.auditEvents({ action: filters.action, result: filters.result, cursor: filters.cursor }),
    queryFn: () =>
      apiRequest<AuditEventPageDto>(
        `/api/v1/audit-events${buildQueryString({
          action: filters.action,
          result: filters.result,
          limit: filters.limit ?? 20,
          cursor: filters.cursor,
        })}`,
      ),
  });
}
