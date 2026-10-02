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
