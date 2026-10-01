import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { findInPagedList } from "./support/lists";
import { createConfirmedUser } from "./support/users";

test.describe("filtros da busca (#43)", () => {
  test("filtros combinam, ficam na URL e se limpam", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regras de filtro não dependem da largura da tela");
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Palco Filtros ${tag}`, undefined, "shows");
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    // Daqui a 48h sempre cai depois de amanhã; grátis e pago para testar a faixa de preço.
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Grátis ${tag}`, startsInHours: 48, durationHours: 2, category: "shows" });
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show Pago ${tag}`, startsInHours: 48, durationHours: 2, category: "shows", priceCents: 8000 });

    await page.goto(`/buscar?q=${encodeURIComponent(`show ${tag}`)}`);
    const eventos = page.getByRole("list", { name: "Eventos encontrados" });
    await expect(eventos.getByRole("listitem")).toHaveCount(2);

    // Painel de filtros: cada mudança já aplica (com JavaScript).
    await page.getByText("Filtros", { exact: true }).click();
    await page.getByLabel("Preço (eventos)").selectOption({ label: "Grátis" });
    await expect(page).toHaveURL(/preco=gratis/);
    await expect(eventos.getByRole("listitem")).toHaveCount(1);
    await expect(eventos.getByText(`Show Grátis ${tag}`)).toBeVisible();
    // Lugares não têm preço: o grupo explica por que sumiu.
    await expect(page.getByText(/Lugares não têm preço cadastrado/)).toBeVisible();

    await page.getByLabel("Categoria").selectOption({ label: "Shows e música" });
    await expect(page).toHaveURL(/categoria=shows/);
    await expect(page).toHaveURL(/preco=gratis/);
    await expect(eventos.getByText(`Show Grátis ${tag}`)).toBeVisible();

    // A URL é compartilhável: abrir de novo traz os mesmos filtros marcados.
    await page.goto(page.url());
    await expect(page.getByLabel("Preço (eventos)")).toHaveValue("gratis");
    const ativos = page.getByRole("navigation", { name: "Filtros ativos" });
    await expect(ativos.getByRole("link", { name: "Remover filtro Grátis" })).toBeVisible();

    // Remover um filtro mantém os outros; "Limpar filtros" mantém a busca.
    await ativos.getByRole("link", { name: "Remover filtro Grátis" }).click();
    await expect(page).not.toHaveURL(/preco=/);
    await expect(page).toHaveURL(/categoria=shows/);
    await expect(eventos.getByRole("listitem")).toHaveCount(2);
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page).toHaveURL(new RegExp(`/buscar\\?q=show\\+${tag}$`));
  });

  test("data e horário: só o que acontece no período", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "regras de filtro não dependem da largura da tela");
    const tag = `${Date.now()}`;
    const placeId = await createTestPlace(`Espaço Período ${tag}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await createTestEvent({ ownerEmail: dono.email, placeId, title: `Feira Período ${tag}`, startsInHours: 48, durationHours: 1 });

    const alvo = new Date(Date.now() + 48 * 3_600_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await page.goto(`/buscar?quando=${alvo}`);
    await expect(await findInPagedList(page, page.getByRole("list", { name: "Eventos encontrados" }), `Feira Período ${tag}`)).toBeVisible();

    await page.goto(`/buscar?q=${encodeURIComponent(`feira ${tag}`)}&quando=hoje`);
    await expect(page.getByText("Nenhum evento encontrado.")).toBeVisible();
  });

  test("bairro filtra lugares; filtro inválido avisa; API de opções e de busca", async ({ page, request }) => {
    const tag = `${Date.now()}`;
    await createTestPlace(`Café Bairro ${tag}`);
    await page.goto(`/buscar?q=${encodeURIComponent(`cafe bairro ${tag}`)}&bairro=${encodeURIComponent(`Bairro Inexistente ${tag}`)}`);
    await expect(page.getByText("Nenhum lugar encontrado.")).toBeVisible();

    await page.goto("/buscar?quando=2026-02-31");
    await expect(page.getByText(/Data inválida/)).toBeVisible();

    const opcoes = await request.get("/api/discovery/filters");
    expect(opcoes.status()).toBe(200);
    const body = await opcoes.json();
    expect(body.horarios.map((h: { value: string }) => h.value)).toEqual(["agora", "manha", "tarde", "noite"]);
    expect(body.bairros.length).toBeGreaterThan(0);

    expect((await request.get("/api/discovery/search?preco=caro")).status()).toBe(400);
    const soEventos = await request.get("/api/discovery/search?preco=gratis");
    expect((await soEventos.json()).groups[0].excluded).toMatch(/Lugares não têm preço/);
  });
});
