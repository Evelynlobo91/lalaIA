import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveCta, createLiveStream, createTestPlace, isolatedPoint, subscribeToPlan } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Data relativa a hoje no formato do <input type="datetime-local"> (fuso de Joinville nos testes).
function hoje(hora: string) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`;
}

test.describe("chamadas (CTAs) na live (#93)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo das chamadas roda só no celular");
  });

  test("plano sem chamadas leva aos planos; com o Pro, o parceiro programa, edita e remove uma chamada", async ({ page }) => {
    const lugar = `Bar das Chamadas ${Date.now()}`;
    const dono = await createConfirmedUser("Dona das Chamadas");
    await createApprovedPartner(dono, "Bar das Chamadas");
    const placeId = await createTestPlace(lugar, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    const stream = await createLiveStream(dono, "place", placeId);

    await loginAs(page, dono, "/parceiro/live");
    await page.getByRole("link", { name: `Chamadas na live de ${lugar}` }).click();
    await expect(page).toHaveURL(new RegExp(`/parceiro/live/chamadas/${stream.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Chamadas na live" })).toBeVisible();

    // No plano padrão não há chamadas: a tela explica e leva aos planos.
    await expect(page.getByText("O seu plano atual não inclui chamadas na live.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Nova chamada" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver planos" })).toHaveAttribute("href", "/parceiro/assinatura");

    await subscribeToPlan(dono, "pro");
    await page.reload();
    const form = page.getByRole("form", { name: "Nova chamada" });
    await expect(page.getByText("Nada programado para hoje.")).toBeVisible();

    // Link fora dos domínios permitidos é recusado, e o formulário mantém o que foi digitado.
    await form.getByLabel("Tipo").selectOption({ label: "Link" });
    await expect(form.getByLabel("Texto do botão")).toHaveValue("Abrir");
    await form.getByLabel("Endereço (https)").fill("https://exemplo.com/cardapio");
    await form.getByLabel("Título").fill("Veja o cardápio");
    await form.getByLabel("Agendamento").selectOption({ label: "Depois que a live entrar no ar" });
    await form.getByLabel("Minutos depois de entrar ao vivo").fill("5");
    await form.getByLabel("Fica por (minutos)").fill("10");
    await form.getByRole("button", { name: "Programar chamada" }).click();
    await expect(form.getByText(/Use um endereço https de:/)).toBeVisible();
    await expect(form.getByLabel("Título")).toHaveValue("Veja o cardápio");

    await form.getByLabel("Endereço (https)").fill("https://instagram.com/bardaschamadas");
    await form.getByRole("button", { name: "Programar chamada" }).click();
    await expect(page).toHaveURL(/\?salvo=/);
    await expect(page.getByText("Chamada salva.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chamadas (1 de 20)" })).toBeVisible();
    const chamada = page.getByRole("article", { name: "Chamada Veja o cardápio" });
    await expect(chamada).toContainText("5 min depois de entrar ao vivo, por 10 min");
    await expect(chamada).toContainText("Link");
    await expect(page.getByRole("list", { name: "Agenda de hoje" })).toContainText("Quando a live entrar no ar: Veja o cardápio");

    // "Quero ir" não pede mais nada: o destino é a rota até o lugar.
    await form.getByLabel("Tipo").selectOption({ label: "Quero ir" });
    await expect(form.getByLabel("Texto do botão")).toHaveValue("Quero ir");
    await form.getByLabel("Título").fill("Vem pra cá");
    await form.getByLabel("Agendamento").selectOption({ label: "De tempos em tempos durante a live" });
    await form.getByRole("button", { name: "Programar chamada" }).click();
    await expect(page.getByRole("heading", { name: "Chamadas (2 de 20)" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Chamada Vem pra cá" })).toContainText("A cada 30 min, por 5 min");

    // Edita: passa para um horário marcado hoje e entra na agenda com hora.
    await chamada.getByRole("link", { name: "Editar a chamada Veja o cardápio" }).click();
    const edicao = page.getByRole("form", { name: "Editar chamada" });
    await expect(edicao.getByLabel("Endereço (https)")).toHaveValue("https://instagram.com/bardaschamadas");
    await edicao.getByLabel("Título").fill("Cardápio da noite");
    await edicao.getByLabel("Agendamento").selectOption({ label: "Em um horário marcado" });
    await edicao.getByLabel("Começa em").fill(hoje("20:00"));
    await edicao.getByLabel("Termina em").fill(hoje("21:30"));
    await edicao.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(new RegExp(`/parceiro/live/chamadas/${stream.id}[?]salvo=`));
    await expect(page.getByRole("list", { name: "Agenda de hoje" })).toContainText("20:00–21:30 · Cardápio da noite");

    // Remove.
    // O formulário não alarga a página no celular.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.getByRole("button", { name: "Remover a chamada Cardápio da noite" }).click();
    await expect(page.getByRole("heading", { name: "Chamadas (1 de 20)" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Chamada Cardápio da noite" })).toHaveCount(0);
  });

  test("disparo manual: com a live no ar, o parceiro solta a chamada e quem assiste vê na hora; depois tira do ar", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const dono = await createConfirmedUser("Dona do Disparo");
    await createApprovedPartner(dono, "Bar do Disparo");
    const placeId = await createTestPlace(`Bar do Disparo ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    await subscribeToPlan(dono, "pro");
    const stream = await createLiveStream(dono, "place", placeId);
    // Programada só para daqui a duas horas de live: sem o disparo, não apareceria agora.
    await createLiveCta(stream.id, { title: "Rodada dupla", href: "https://instagram.com/bardodisparo", offsetMinutes: 120, durationMinutes: 10 });

    await loginAs(page, dono, `/parceiro/live/chamadas/${stream.id}`);
    const chamada = page.getByRole("article", { name: "Chamada Rodada dupla" });
    const soltar = chamada.getByRole("button", { name: "Soltar agora a chamada Rodada dupla" });
    await expect(soltar).toBeDisabled();
    await expect(chamada.getByText("Disponível com a live no ar.")).toBeVisible();

    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    const context = await browser.newContext();
    const publico = await context.newPage();
    await publico.goto(`/lugares/${placeId}`);
    const cartao = publico.getByRole("complementary", { name: "Chamada do anfitrião" });
    await expect(publico.getByRole("region", { name: "Transmissão ao vivo" }).locator("video")).toBeVisible();
    await expect(cartao).toHaveCount(0);

    await page.reload();
    await soltar.click();
    await expect(chamada.getByRole("status")).toContainText("No ar até");
    await expect(page.getByRole("list", { name: "Agenda de hoje" })).toContainText("Rodada dupla");
    await expect(cartao).toContainText("Rodada dupla", { timeout: 30_000 });

    await chamada.getByRole("button", { name: "Tirar do ar a chamada Rodada dupla" }).click();
    await expect(soltar).toBeEnabled();
    await expect(cartao).toHaveCount(0, { timeout: 30_000 });
    await context.close();
  });

  test("parceiro não abre as chamadas da transmissão de outro", async ({ page }) => {
    const dono = await createConfirmedUser("Dona");
    const outro = await createConfirmedUser("Outro parceiro");
    await createApprovedPartner(dono, "Bar da Dona");
    await createApprovedPartner(outro, "Bar do Outro");
    const placeId = await createTestPlace(`Bar Alheio ${Date.now()}`, isolatedPoint());
    await assignPlaceTo(dono, placeId);
    const stream = await createLiveStream(dono, "place", placeId);

    await loginAs(page, outro, "/parceiro/inicio");
    const response = await page.goto(`/parceiro/live/chamadas/${stream.id}`);
    expect(response?.status()).toBe(404);
  });
});
