import { expect, test } from "@playwright/test";

test.describe("saúde e status (#81)", () => {
  test("/api/health responde as dependências, sem cache e sem detalhes internos", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.map((c: { name: string }) => c.name).sort()).toEqual(["autenticacao", "banco"]);
    expect(Object.keys(body.checks[0]).sort()).toEqual(["critical", "latencyMs", "name", "status"]);
    expect((await request.head("/api/health")).status()).toBe(200);
  });

  test("página /status mostra a situação de cada serviço", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "conteúdo não depende da largura da tela");
    await page.goto("/status");
    await expect(page.getByText("Tudo funcionando")).toBeVisible();
    await expect(page.getByRole("list", { name: "Serviços" }).getByRole("listitem")).toHaveCount(2);
  });
});
