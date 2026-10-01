import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestEvent, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Data relativa a hoje no formato do <input type="datetime-local"> (fuso de Joinville nos testes).
function emDias(dias: number, hora: string) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`;
}

test.describe("descontos e promoções do parceiro (#30)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("parceiro cria oferta, explorador resgata e o parceiro valida o código uma vez só", async ({ page, browser }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Café Oferta ${sufixo}`);
    const parceiro = await createConfirmedUser("Dona do Café");
    await createApprovedPartner(parceiro, "Café Oferta E2E");
    await assignPlaceTo(parceiro, lugar);

    // 1. Parceiro cria a oferta no portal.
    await loginAs(page, parceiro, "/parceiro/ofertas");
    await page.getByRole("link", { name: "Nova oferta" }).click();
    await page.getByLabel("Onde vale").selectOption({ label: `Café Oferta ${sufixo}` });
    await page.getByLabel("Título").fill("10% no café E2E");
    await page.getByLabel("Descrição e regras").fill("Desconto em qualquer café da casa.");
    await page.getByLabel("Começa em").fill(emDias(-1, "08:00"));
    await page.getByLabel("Termina em").fill(emDias(5, "22:00"));
    await page.getByLabel("Limite total de resgates (opcional)").fill("20");
    await page.getByRole("button", { name: "Publicar oferta" }).click();
    await expect(page).toHaveURL(/\/parceiro\/ofertas\?salvo=/);
    await expect(page.getByRole("region", { name: "Valendo e agendadas" }).getByText("10% no café E2E")).toBeVisible();

    // 2. Visitante vê a oferta e é convidado a entrar; logado, resgata e recebe o código.
    const explorador = await createConfirmedUser("Explorador");
    const context = await browser.newContext();
    const outra = await context.newPage();
    await outra.goto(`/lugares/${lugar}`);
    const ofertas = outra.getByRole("region", { name: "Ofertas" });
    await expect(ofertas.getByText("10% no café E2E")).toBeVisible();
    await expect(ofertas.getByRole("link", { name: "Entre para resgatar" })).toBeVisible();

    await loginAs(outra, explorador, `/lugares/${lugar}`);
    await outra.getByRole("button", { name: "Resgatar 10% no café E2E" }).click();
    const codigo = (await outra.getByRole("status").filter({ hasText: "Seu código" }).locator(".font-mono").textContent())!.trim();
    expect(codigo).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);

    // Recarregar mostra o mesmo código (idempotente) e ele fica em "Meus resgates".
    await outra.reload();
    await expect(outra.getByRole("region", { name: "Ofertas" }).getByText(codigo)).toBeVisible();
    await outra.goto("/perfil");
    await expect(outra.getByText("Meus resgates")).toBeVisible();
    await expect(outra.getByText(codigo)).toBeVisible();
    await context.close();

    // 3. Parceiro valida: vale uma vez só; código inexistente é "inválido".
    await page.goto("/parceiro/ofertas");
    await page.getByLabel("Código do cliente").fill(codigo.toLowerCase());
    await page.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "validado" })).toContainText("10% no café E2E");

    await page.getByLabel("Código do cliente").fill(codigo);
    await page.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("já foi usado");

    await page.getByLabel("Código do cliente").fill("ZZZZ-2222");
    await page.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Código inválido.");
    await expect(page.getByText("1 resgate de 20 · 1 usado no balcão")).toBeVisible();
  });

  test("outro parceiro não valida o código (resposta igual à de código inexistente)", async ({ page, browser }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Bar Oferta ${sufixo}`);
    const dono = await createConfirmedUser("Dono do Bar");
    await createApprovedPartner(dono, "Bar Oferta E2E");
    await assignPlaceTo(dono, lugar);
    await loginAs(page, dono, "/parceiro/ofertas/nova");
    await page.getByLabel("Onde vale").selectOption({ label: `Bar Oferta ${sufixo}` });
    await page.getByLabel("Título").fill("Chope em dobro E2E");
    await page.getByLabel("Descrição e regras").fill("Na compra de um chope, ganhe outro.");
    await page.getByLabel("Começa em").fill(emDias(-1, "08:00"));
    await page.getByLabel("Termina em").fill(emDias(5, "22:00"));
    await page.getByRole("button", { name: "Publicar oferta" }).click();
    await expect(page).toHaveURL(/\/parceiro\/ofertas\?salvo=/);

    const explorador = await createConfirmedUser("Explorador");
    const ctx = await browser.newContext();
    const exp = await ctx.newPage();
    await loginAs(exp, explorador, `/lugares/${lugar}`);
    await exp.getByRole("button", { name: "Resgatar Chope em dobro E2E" }).click();
    const codigo = (await exp.getByRole("status").filter({ hasText: "Seu código" }).locator(".font-mono").textContent())!.trim();
    await ctx.close();

    const intruso = await createConfirmedUser("Outro parceiro");
    await createApprovedPartner(intruso, "Concorrente E2E");
    const ctx2 = await browser.newContext();
    const outro = await ctx2.newPage();
    await loginAs(outro, intruso, "/parceiro/ofertas");
    await outro.getByLabel("Código do cliente").fill(codigo);
    await outro.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(outro.getByRole("alert")).toHaveText("Código inválido.");
    await ctx2.close();
  });

  test("oferta esgotada aparece como indisponível na página do evento", async ({ page, browser }) => {
    const sufixo = Date.now();
    const lugar = await createTestPlace(`Casa de Shows ${sufixo}`);
    const promotor = await createConfirmedUser("Promotora");
    await createApprovedPartner(promotor, "Promotora E2E");
    const evento = await createTestEvent({ ownerEmail: promotor.email, placeId: lugar, title: `Show Oferta ${sufixo}`, startsInHours: 24, durationHours: 3 });

    await loginAs(page, promotor, "/parceiro/ofertas/nova");
    await page.getByLabel("Onde vale").selectOption({ label: `Show Oferta ${sufixo}` });
    await page.getByLabel("Título").fill("Meia-entrada E2E");
    await page.getByLabel("Descrição e regras").fill("Meia-entrada para os primeiros.");
    await page.getByLabel("Começa em").fill(emDias(-1, "08:00"));
    await page.getByLabel("Termina em").fill(emDias(3, "22:00"));
    await page.getByLabel("Limite total de resgates (opcional)").fill("1");
    await page.getByRole("button", { name: "Publicar oferta" }).click();
    await expect(page).toHaveURL(/\/parceiro\/ofertas\?salvo=/);

    // O dono não resgata a própria oferta.
    await page.goto(`/eventos/${evento}`);
    await expect(page.getByText("Esta oferta é sua.")).toBeVisible();

    const primeira = await createConfirmedUser("Primeira");
    const ctx = await browser.newContext();
    const p1 = await ctx.newPage();
    await loginAs(p1, primeira, `/eventos/${evento}`);
    await p1.getByRole("button", { name: "Resgatar Meia-entrada E2E" }).click();
    await expect(p1.getByText("Seu código")).toBeVisible();
    await ctx.close();

    const segunda = await createConfirmedUser("Segunda");
    const ctx2 = await browser.newContext();
    const p2 = await ctx2.newPage();
    await loginAs(p2, segunda, `/eventos/${evento}`);
    const ofertas = p2.getByRole("region", { name: "Ofertas" });
    await expect(ofertas.getByText("Esgotada")).toBeVisible();
    await expect(ofertas.getByText("Indisponível no momento.")).toBeVisible();
    await expect(ofertas.getByRole("button", { name: /Resgatar/ })).toHaveCount(0);
    await ctx2.close();
  });
});
