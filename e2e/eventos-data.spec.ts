import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { findInPagedList } from "./support/lists";
import { createConfirmedUser } from "./support/users";

test.describe("eventos por data (#39)", () => {
  test("atalhos hoje/amanhã e data específica filtram e ficam marcados", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regra de datas não depende da largura da tela");
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Espaço Datas ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    // "daqui a 48h" cai depois de amanhã em qualquer horário do dia.
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Depois de amanhã ${tag}`, startsInHours: 48, durationHours: 1 });

    await page.goto("/eventos?quando=hoje");
    const filtro = page.getByRole("navigation", { name: "Filtrar por data" });
    await expect(filtro.getByRole("link", { name: "Hoje" })).toHaveAttribute("aria-current", "true");
    const lista = page.getByRole("list", { name: "Eventos" });
    await findInPagedList(page, lista, "__nunca__", 50);
    await expect(lista.getByText(`Depois de amanhã ${tag}`)).toHaveCount(0);

    // Data específica do evento (pela própria página do evento seria outra rota; aqui usamos a data local).
    const alvo = new Date(Date.now() + 48 * 3_600_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await page.goto(`/eventos?quando=${alvo}`);
    await expect(page.getByLabel("Escolher uma data")).toHaveValue(alvo);
    await expect(await findInPagedList(page, lista, `Depois de amanhã ${tag}`)).toBeVisible();

    await filtro.getByRole("link", { name: "Amanhã" }).click();
    await expect(page).toHaveURL(/quando=amanha$/);
    await expect(filtro.getByRole("link", { name: "Amanhã" })).toHaveAttribute("aria-current", "true");
  });

  test("data impossível mostra aviso em vez de quebrar", async ({ page, request }) => {
    await page.goto("/eventos?quando=2026-02-31");
    await expect(page.getByText(/Data inválida/)).toBeVisible();
    expect((await request.get("/api/events?quando=ontem")).status()).toBe(400);
  });
});
