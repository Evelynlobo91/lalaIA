import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConflictError, err, ok } from "../kernel";
import { setErrorReporter, type ErrorReporter } from "../observability/error-reporter";
import { formAction, idleFormState } from "./form-action";

const schema = z.object({ email: z.email("E-mail inválido."), password: z.string().min(8, "Senha curta.") });

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

let reporter: ErrorReporter;
beforeEach(() => {
  reporter = { capture: vi.fn() };
  setErrorReporter(reporter);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  setErrorReporter(undefined);
  vi.restoreAllMocks();
});

describe("formAction", () => {
  it("sucesso: devolve os dados do caso de uso", async () => {
    const action = formAction(schema, async (input) => ok({ email: input.email }));
    expect(await action(idleFormState, form({ email: "a@b.com", password: "12345678" }))).toEqual({ status: "success", data: { email: "a@b.com" } });
  });

  it("validação: erros por campo e devolve só os valores permitidos (nunca a senha)", async () => {
    const handler = vi.fn();
    const action = formAction(schema, handler, { keepValues: ["email"] });

    const state = await action(idleFormState, form({ email: "ruim", password: "123" }));

    expect(state).toEqual({ status: "error", fieldErrors: { email: ["E-mail inválido."], password: ["Senha curta."] }, values: { email: "ruim" } });
    expect(JSON.stringify(state)).not.toContain('"123"');
    expect(handler).not.toHaveBeenCalled();
  });

  it("campos em `arrays` viram lista (checkboxes com o mesmo name)", async () => {
    const action = formAction(z.object({ tags: z.array(z.string()) }), async (input) => ok(input.tags), { arrays: ["tags"] });
    const fd = new FormData();
    fd.append("tags", "a");
    fd.append("tags", "b");
    expect(await action(idleFormState, fd)).toEqual({ status: "success", data: ["a", "b"] });
    expect(await action(idleFormState, new FormData())).toEqual({ status: "success", data: [] });
  });

  it("erro de domínio vira mensagem para o usuário", async () => {
    const action = formAction(schema, async () => err(new ConflictError("Já existe.")));
    expect(await action(idleFormState, form({ email: "a@b.com", password: "12345678" }))).toMatchObject({ status: "error", message: "Já existe." });
  });

  it("exceção inesperada: mensagem genérica, sem vazar detalhes, e reportada", async () => {
    const boom = new Error("senha do banco: xyz");
    const action = formAction(schema, async () => {
      throw boom;
    });

    const state = await action(idleFormState, form({ email: "a@b.com", password: "12345678" }));

    expect(state).toMatchObject({ status: "error", message: "Algo deu errado. Tente novamente em instantes." });
    expect(JSON.stringify(state)).not.toContain("xyz");
    expect(reporter.capture).toHaveBeenCalledWith(boom);
  });
});

describe("formAction + ValidationError do caso de uso", () => {
  it("detalhes com path viram erro no campo", async () => {
    const { ValidationError } = await import("../kernel");
    const action = formAction(z.object({ x: z.string() }), async () => err(new ValidationError("Lugar não encontrado.", [{ path: ["placeId"], message: "Escolha um lugar da lista." }])));
    const fd = new FormData();
    fd.set("x", "1");
    expect(await action(idleFormState, fd)).toMatchObject({ status: "error", fieldErrors: { placeId: ["Escolha um lugar da lista."] } });
  });
});
