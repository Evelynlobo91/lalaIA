import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BusinessRuleError, ForbiddenError, NotFoundError, err, ok } from "../kernel";
import { jsonRoute, queryRoute } from "./json-route";

const post = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

const schema = z.object({ name: z.string().min(1) });

describe("jsonRoute", () => {
  it("valida, chama o handler e responde com o status de sucesso", async () => {
    const route = jsonRoute(schema, async (input) => ok({ hello: input.name }), { successStatus: 201 });

    const res = await route(post({ name: "Lala" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ hello: "Lala" });
  });

  it("responde 400 com as issues quando a entrada é inválida, sem chamar o handler", async () => {
    const handler = vi.fn();
    const route = jsonRoute(schema, handler);

    const res = await route(post({ name: "" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details[0].path).toEqual(["name"]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("responde 400 para JSON malformado", async () => {
    const res = await jsonRoute(schema, async () => ok(null))(post("{ruim"));
    expect(res.status).toBe(400);
  });

  it.each([
    [new NotFoundError("Evento"), 404, "not_found"],
    [new ForbiddenError(), 403, "forbidden"],
    [new BusinessRuleError("mission_expired", "Missão expirada."), 422, "mission_expired"],
  ])("mapeia %o para HTTP %i", async (error, status, code) => {
    const res = await jsonRoute(schema, async () => err(error))(post({ name: "a" }));
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it("responde 500 genérico para exceção inesperada, sem vazar a mensagem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await jsonRoute(schema, async () => {
      throw new Error("senha do banco: 123");
    })(post({ name: "a" }));

    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("senha");
    spy.mockRestore();
  });
});

describe("queryRoute", () => {
  it("valida os query params com coerção do zod", async () => {
    const route = queryRoute(z.object({ page: z.coerce.number().int().min(1) }), async (q) => ok({ page: q.page }));

    expect(await (await route(new Request("http://x/api?page=2"))).json()).toEqual({ page: 2 });
    expect((await route(new Request("http://x/api?page=0"))).status).toBe(400);
  });
});
