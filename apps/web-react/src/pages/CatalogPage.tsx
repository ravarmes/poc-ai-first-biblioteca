import type { Principal, WorkDto } from "@biblioteca/contract";
import { useState } from "react";
import { ApiProblemError } from "../api/http.ts";
import {
  useCreateWorkMutation,
  usePlaceHoldMutation,
  useRegisterCopyMutation,
  useSearchWorks,
  useUpdateWorkMutation,
  useWorkAvailability,
} from "../api/queries.ts";
import { Card, ProblemAlert, StatusBadge } from "../components/ui.tsx";
import { VersionConflictBanner } from "../components/version-conflict.tsx";

function WorkAvailabilityRow({
  work,
  principal,
  onStartEdit,
}: {
  work: WorkDto;
  principal: Principal;
  onStartEdit: (work: WorkDto) => void;
}) {
  const availability = useWorkAvailability(work.id);
  const registerCopy = useRegisterCopyMutation();
  const placeHold = usePlaceHoldMutation();
  const [barcode, setBarcode] = useState("");
  const [holdSuccess, setHoldSuccess] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  function handleRegisterCopy(e: React.FormEvent) {
    e.preventDefault();
    setCopySuccess(null);
    registerCopy.mutate(
      { workId: work.id, barcode },
      {
        onSuccess: (created) => {
          setBarcode("");
          setCopySuccess(`Exemplar ${created.barcode} cadastrado.`);
        },
      },
    );
  }

  function handlePlaceHold() {
    setHoldSuccess(null);
    placeHold.mutate(
      { workId: work.id },
      {
        onSuccess: () => {
          setHoldSuccess("Reserva registrada na fila FIFO da obra.");
        },
      },
    );
  }

  const av = availability.data;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{work.title}</h3>
          <p className="mt-0.5 text-sm text-slate-700">{work.authors.join(", ")}</p>
          <p className="mt-1 text-xs text-slate-500">
            Assunto: <span className="font-medium text-slate-700">{work.subject}</span>
            {work.isbn ? ` • ISBN ${work.isbn}` : ""}
            {` • v${work.version}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {av ? (
            <>
              <StatusBadge
                status={av.availableCopies > 0 ? "available" : "on-loan"}
                label={`${av.availableCopies} disponíveis / ${av.totalCopies - av.retiredCopies} ativos`}
              />
              {av.waitingHolds > 0 ? (
                <StatusBadge status="waiting" label={`${av.waitingHolds} na fila`} />
              ) : null}
            </>
          ) : null}
          {principal.role === "librarian" ? (
            <button
              type="button"
              onClick={() => onStartEdit(work)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Editar obra
            </button>
          ) : null}
        </div>
      </div>

      {principal.role === "student" && av?.canPlaceHold ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={placeHold.isPending}
            onClick={handlePlaceHold}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {placeHold.isPending ? "Reservando..." : "Entrar na fila de reserva"}
          </button>
          {holdSuccess ? <span className="text-xs font-medium text-emerald-700">{holdSuccess}</span> : null}
          <ProblemAlert error={placeHold.error} onDismiss={() => placeHold.reset()} />
        </div>
      ) : null}

      {principal.role === "librarian" ? (
        <form onSubmit={handleRegisterCopy} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <label htmlFor={`barcode-${work.id}`} className="sr-only">
            Código de barras para novo exemplar
          </label>
          <input
            id={`barcode-${work.id}`}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Novo código de barras (ex.: EX-105)"
            className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={registerCopy.isPending}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {registerCopy.isPending ? "Cadastrando..." : "Adicionar exemplar"}
          </button>
          {copySuccess ? <span className="text-xs font-medium text-emerald-700">{copySuccess}</span> : null}
          <div className="w-full">
            <ProblemAlert error={registerCopy.error} onDismiss={() => registerCopy.reset()} />
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function CatalogPage({ principal }: { principal: Principal }) {
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const [title, setTitle] = useState("");
  const [authorsText, setAuthorsText] = useState("");
  const [subject, setSubject] = useState("");
  const [isbn, setIsbn] = useState("");
  const [editingWork, setEditingWork] = useState<WorkDto | null>(null);

  const worksQuery = useSearchWorks({ q: appliedQuery || undefined, cursor, limit: 20 });
  const createWork = useCreateWorkMutation();
  const updateWork = useUpdateWorkMutation();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setCursor(undefined);
    setAppliedQuery(searchInput.trim());
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const authors = authorsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingWork) {
      updateWork.mutate(
        {
          workId: editingWork.id,
          version: editingWork.version,
          title: title.trim(),
          authors,
          subject: subject.trim(),
          isbn: isbn.trim() ? isbn.trim() : null,
        },
        {
          onSuccess: () => {
            setEditingWork(null);
            setTitle("");
            setAuthorsText("");
            setSubject("");
            setIsbn("");
          },
        },
      );
      return;
    }

    createWork.mutate(
      {
        title: title.trim(),
        authors,
        subject: subject.trim(),
        isbn: isbn.trim() ? isbn.trim() : null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setAuthorsText("");
          setSubject("");
          setIsbn("");
        },
      },
    );
  }

  function startEdit(work: WorkDto) {
    setEditingWork(work);
    setTitle(work.title);
    setAuthorsText(work.authors.join(", "));
    setSubject(work.subject);
    setIsbn(work.isbn ?? "");
    createWork.reset();
    updateWork.reset();
  }

  return (
    <div className="space-y-6">
      <Card
        title="Consulta ao Acervo"
        subtitle="Pesquise obras por título, autor, assunto ou ISBN e acompanhe a disponibilidade em tempo real."
      >
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <label htmlFor="catalog-search" className="sr-only">
            Buscar no acervo
          </label>
          <input
            id="catalog-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por título, autor, assunto ou ISBN..."
            className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
          >
            Buscar
          </button>
          {appliedQuery || cursor ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setAppliedQuery("");
                setCursor(undefined);
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Limpar
            </button>
          ) : null}
        </form>
      </Card>

      {principal.role === "librarian" ? (
        <Card
          title={editingWork ? `Editar obra (v${editingWork.version})` : "Nova Obra no Catálogo"}
          subtitle="Somente bibliotecárias cadastram ou atualizam obras (com ISBN-10/13 validado)."
          actions={
            editingWork ? (
              <button
                type="button"
                onClick={() => {
                  setEditingWork(null);
                  setTitle("");
                  setAuthorsText("");
                  setSubject("");
                  setIsbn("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
              >
                Cancelar edição
              </button>
            ) : null
          }
        >
          <div className="space-y-3">
            <VersionConflictBanner
              error={updateWork.error}
              isReloading={worksQuery.isFetching}
              onReloadCurrent={() => {
                void worksQuery.refetch();
                setEditingWork(null);
                updateWork.reset();
              }}
            />
            {!(updateWork.error instanceof ApiProblemError && updateWork.error.isVersionConflict) ? (
              <ProblemAlert
                error={editingWork ? updateWork.error : createWork.error}
                onDismiss={() => {
                  createWork.reset();
                  updateWork.reset();
                }}
              />
            ) : null}

            <form onSubmit={handleCreateSubmit} className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="work-title" className="block text-xs font-semibold text-slate-700">
                  Título da obra
                </label>
                <input
                  id="work-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="work-authors" className="block text-xs font-semibold text-slate-700">
                  Autores (separados por vírgula)
                </label>
                <input
                  id="work-authors"
                  type="text"
                  required
                  value={authorsText}
                  onChange={(e) => setAuthorsText(e.target.value)}
                  placeholder="Eric Evans, Vaughn Vernon"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="work-subject" className="block text-xs font-semibold text-slate-700">
                  Assunto / Área
                </label>
                <input
                  id="work-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Engenharia de Software"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="work-isbn" className="block text-xs font-semibold text-slate-700">
                  ISBN (opcional, 10 ou 13 dígitos)
                </label>
                <input
                  id="work-isbn"
                  type="text"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  placeholder="9780321125217"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={createWork.isPending || updateWork.isPending}
                  className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
                >
                  {editingWork ? "Salvar alterações" : "Cadastrar Obra"}
                </button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      <div className="space-y-3">
        <ProblemAlert error={worksQuery.error} />
        {worksQuery.isLoading ? <p className="text-sm text-slate-600">Carregando acervo...</p> : null}
        {worksQuery.data && worksQuery.data.items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Nenhuma obra encontrada para o filtro informado.
          </p>
        ) : null}
        {worksQuery.data?.items.map((work) => (
          <WorkAvailabilityRow key={work.id} work={work} principal={principal} onStartEdit={startEdit} />
        ))}
        {worksQuery.data?.nextCursor ? (
          <button
            type="button"
            onClick={() => setCursor(worksQuery.data!.nextCursor!)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Próxima página
          </button>
        ) : null}
      </div>
    </div>
  );
}
