import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "../kernel";
import { setErrorReporter, type ErrorReporter } from "../observability/error-reporter";
import { currentRequestContext } from "../observability/request-context";
import { jsonRoute } from "./json-route";
import { observed } from "./observed";
import { z } from "zod";

let reporter: ErrorReporter;
let stdout: { mock: { calls: unknown[][] } };
let stderr: { mock: { calls: unknown[][] } };

beforeEach(() => {
  reporter = { capture: vi.fn() };
  setErrorReporter(reporter);
  stdout = vi.spyOn(console, "log").mockImplementation(() => {});
  stderr = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  setErrorReporter(undefined);
  vi.restoreAllMocks();
});

const logged = (spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> => spy.mock.calls.map(([line]) => JSON.parse(String(line)));

describe("observed", () => {
  it("gera requestId, disponibiliza no contexto e devolve no header", async () => {
    let seen: string | undefined;
    const route = observed(async () => {
      seen = currentRequestContext()?.requestId;
      return new Response("ok");
    });

    const res = await route(new Request("http://x/api/ping"));

    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(seen);
  });

  it("reaproveita x-request-id válido e descarta valor malicioso", async () => {
    const route = observed(async () => new Response("ok"));

    const valid = await route(new Request("http://x", { headers: { "x-request-id": "abc-12345678" } }));
    const invalid = await route(new Request("http://x", { headers: { "x-request-id": "<script>alert(1)</script>" } }));

    expect(valid.headers.get("x-request-id")).toBe("abc-12345678");
    expect(invalid.headers.get("x-request-id")).not.toContain("<");
  });

  it("registra log de acesso com método, rota, status e duração", async () => {
    await observed(async () => new Response(null, { status: 204 }))(new Request("http://x/api/places?q=1", { method: "GET" }));

    expect(logged(stdout)[0]).toMatchObject({ level: "info", msg: "requisição", method: "GET", path: "/api/places", status: 204 });
    expect(logged(stdout)[0].durationMs).toEqual(expect.any(Number));
  });

  it("exceção inesperada: 500 com requestId, log de erro e reporte ao Sentry", async () => {
    const boom = new Error("conexão recusada");
    const res = await jsonRoute(z.object({}), async () => {
      throw boom;
    })(new Request("http://x/api", { method: "POST", body: "{}" }));

    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
    expect(reporter.capture).toHaveBeenCalledWith(boom);
    expect(logged(stderr).map((l) => l.msg)).toEqual(["erro inesperado", "requisição falhou"]);
  });

  it("erro de domínio não é reportado ao Sentry", async () => {
    const res = await jsonRoute(z.object({ n: z.number() }), async () => ok(1))(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(reporter.capture).not.toHaveBeenCalled();
  });
});
