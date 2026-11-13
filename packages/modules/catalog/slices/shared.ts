// Mapeador de DTO compartilhado pelas fatias do Acervo (fora de domain/): entrega ao contrato o valor primitivo
// dos objetos de valor (WorkTitle e Isbn).
import type { WorkDto } from "@biblioteca/contract";
import type { WorkProps } from "../domain/work.ts";

export function toWorkDto(work: WorkProps): WorkDto {
  return {
    id: work.id,
    title: work.title.value,
    authors: [...work.authors],
    subject: work.subject,
    isbn: work.isbn?.value ?? null,
    version: work.version,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
  };
}
