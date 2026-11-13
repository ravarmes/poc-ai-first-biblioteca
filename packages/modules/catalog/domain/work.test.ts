import { ProblemError } from "@biblioteca/core";
import { describe, expect, test } from "vitest";
import { CATALOG_SCOPE } from "./work-repository.ts";
import { Isbn, isValidIsbn10, isValidIsbn13, Work } from "./work.ts";

describe("Domínio do Acervo — Work & Isbn (spec 002)", () => {
  test("define CATALOG_SCOPE como mod_catalog no schema catalog", () => {
    expect(CATALOG_SCOPE).toEqual({ role: "mod_catalog", searchPath: "catalog" });
  });

  test("[1.1] cria obra normalizando espaços das pontas, ISBN em branco vira null e aceita ISBN-13/ISBN-10 com X", () => {
    const work = Work.create({
      title: "  Domain-Driven Design  ",
      authors: ["  Eric Evans  "],
      subject: "  Arquitetura de Software  ",
      isbn: " 978-0-321-12521-7 ",
    });

    expect(work.props.title).toBe("Domain-Driven Design");
    expect(work.props.authors).toEqual(["Eric Evans"]);
    expect(work.props.subject).toBe("Arquitetura de Software");
    expect(work.props.isbn).toBe("9780321125217");
    expect(work.props.version).toBe(1);

    const noIsbnFromBlank = Work.create({
      title: "Sem ISBN",
      authors: ["Autor"],
      subject: "Geral",
      isbn: "   ",
    });
    expect(noIsbnFromBlank.props.isbn).toBeNull();

    expect(Isbn.parse("0-306-40615-2").value).toBe("0306406152");
    expect(Isbn.parse("0-8044-2957-x").value).toBe("080442957X");
    expect(isValidIsbn10("0306406152")).toBe(true);
    expect(isValidIsbn10("10306406152")).toBe(false);
    expect(isValidIsbn10("03064061529")).toBe(false);
    expect(isValidIsbn13("9780321125217")).toBe(true);
    expect(isValidIsbn13("09780321125217")).toBe(false);
    expect(isValidIsbn13("97803211252170")).toBe(false);
  });

  test("[1.2] rejeita ISBN inválido, limites de título/assunto/autores e expõe field errors em português", () => {
    const captureProblem = (fn: () => unknown): ProblemError => {
      try {
        fn();
      } catch (err) {
        expect(err).toBeInstanceOf(ProblemError);
        return err as ProblemError;
      }
      throw new Error("Esperava ProblemError");
    };

    const badIsbn13 = captureProblem(() => Isbn.parse("978-0-321-12521-0"));
    expect(badIsbn13.detail).toBe("ISBN-13 inválido.");
    expect(badIsbn13.errors).toEqual([{ field: "isbn", message: "dígito verificador do ISBN-13 é inválido" }]);

    const badIsbn10 = captureProblem(() => Isbn.parse("0306406159"));
    expect(badIsbn10.detail).toBe("ISBN-10 inválido.");
    expect(badIsbn10.errors).toEqual([{ field: "isbn", message: "dígito verificador do ISBN-10 é inválido" }]);

    const badLen = captureProblem(() => Isbn.parse("12345"));
    expect(badLen.detail).toBe("ISBN inválido.");
    expect(badLen.errors).toEqual([{ field: "isbn", message: "ISBN deve ter 10 ou 13 dígitos" }]);

    expect(() => Isbn.parse("abcdefghij")).toThrowError(ProblemError);
    expect(() => Isbn.parse("978032112521A")).toThrowError(ProblemError);

    expect(
      Work.create({ title: "A".repeat(200), authors: ["Autor"], subject: "S".repeat(120) }).props.subject,
    ).toHaveLength(120);

    const tooLongTitle = captureProblem(() =>
      Work.create({ title: "A".repeat(201), authors: ["Autor"], subject: "Computação" }),
    );
    expect(tooLongTitle.detail).toBe("título excede o limite.");
    expect(tooLongTitle.errors).toEqual([{ field: "title", message: "título deve ter no máximo 200 caracteres" }]);

    const emptyTitle = captureProblem(() =>
      Work.create({ title: "   ", authors: ["Autor"], subject: "Computação" }),
    );
    expect(emptyTitle.detail).toBe("título inválido.");
    expect(emptyTitle.errors).toEqual([{ field: "title", message: "título não pode ficar vazio" }]);

    const emptySubject = captureProblem(() =>
      Work.create({ title: "Livro", authors: ["Autor"], subject: "   " }),
    );
    expect(emptySubject.detail).toBe("assunto inválido.");
    expect(emptySubject.errors).toEqual([{ field: "subject", message: "assunto não pode ficar vazio" }]);

    const tooLongSubject = captureProblem(() =>
      Work.create({ title: "Livro", authors: ["Autor"], subject: "S".repeat(121) }),
    );
    expect(tooLongSubject.detail).toBe("assunto excede o limite.");
    expect(tooLongSubject.errors).toEqual([{ field: "subject", message: "assunto deve ter no máximo 120 caracteres" }]);

    // Limite exato de 20 autores vs 21 autores
    const twentyAuthors = Array.from({ length: 20 }, (_, i) => `Autor ${i + 1}`);
    expect(Work.create({ title: "Coletânea", authors: twentyAuthors, subject: "Geral" }).props.authors).toHaveLength(20);

    const emptyAuthors = captureProblem(() => Work.create({ title: "Livro", authors: [], subject: "Computação" }));
    expect(emptyAuthors.detail).toBe("Lista de autores inválida.");
    expect(emptyAuthors.errors).toEqual([{ field: "authors", message: "informe entre 1 e 20 autores" }]);

    const twentyOneAuthors = Array.from({ length: 21 }, (_, i) => `Autor ${i + 1}`);
    expect(() => Work.create({ title: "Livro", authors: twentyOneAuthors, subject: "Computação" })).toThrowError(
      ProblemError,
    );

    const blankSecondAuthor = captureProblem(() =>
      Work.create({ title: "Livro", authors: ["Ok", "  "], subject: "Computação" }),
    );
    expect(blankSecondAuthor.errors).toEqual([{ field: "authors.1", message: "autor não pode ficar vazio" }]);
  });

  test("[1.5] edita todos os campos (incluindo subject e isbn null/string), detecta no-op e registra diff completo", () => {
    const work = Work.create({
      title: "Código Limpo",
      authors: ["Robert Martin"],
      subject: "Engenharia",
      isbn: "9780132350884",
    });

    const noop = work.edit(
      { title: "  Código Limpo  ", authors: ["Robert Martin"], subject: "Engenharia", isbn: "9780132350884" },
      1,
    );
    expect(noop.changed).toBe(false);
    expect(noop.changes).toEqual({});
    expect(noop.work.props.version).toBe(1);

    // Mesma quantidade de autores com elemento alterado também detecta diff
    const editedSameLen = work.edit({ authors: ["Uncle Bob"] }, 1);
    expect(editedSameLen.changed).toBe(true);
    expect(editedSameLen.changes).toEqual({
      authors: { before: ["Robert Martin"], after: ["Uncle Bob"] },
    });

    const edited = work.edit(
      {
        title: "Código Limpo (2a ed.)",
        authors: ["Robert C. Martin", "Ana"],
        subject: "Engenharia de Software",
        isbn: null,
      },
      1,
      "2026-11-10T15:00:00.000Z",
    );
    expect(edited.changed).toBe(true);
    expect(edited.work.props.version).toBe(2);
    expect(edited.work.props.subject).toBe("Engenharia de Software");
    expect(edited.work.props.isbn).toBeNull();
    expect(edited.work.props.updatedAt).toBe("2026-11-10T15:00:00.000Z");
    expect(edited.changes).toEqual({
      title: { before: "Código Limpo", after: "Código Limpo (2a ed.)" },
      authors: { before: ["Robert Martin"], after: ["Robert C. Martin", "Ana"] },
      subject: { before: "Engenharia", after: "Engenharia de Software" },
      isbn: { before: "9780132350884", after: null },
    });

    // Recoloca ISBN e limpa via string vazia
    const withIsbn = edited.work.edit({ isbn: "0-306-40615-2" }, 2);
    expect(withIsbn.work.props.isbn).toBe("0306406152");
    const clearedBlank = withIsbn.work.edit({ isbn: "   " }, 3);
    expect(clearedBlank.work.props.isbn).toBeNull();

    expect(() => edited.work.edit({ subject: "Novo" }, 1)).toThrowError(ProblemError);
    try {
      edited.work.edit({ subject: "Novo" }, 1);
    } catch (err) {
      expect((err as ProblemError).code).toBe("version-conflict");
      expect((err as ProblemError).detail).toBe(
        "Esta obra foi alterada por outra pessoa; recarregue para continuar.",
      );
      expect((err as ProblemError).currentVersion).toBe(2);
    }
  });
});
