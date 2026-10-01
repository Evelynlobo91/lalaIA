import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createLiveStream, createTestEvent, createTestPlace } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("Live: informações contextuais da transmissão (#53)", () => {
  test("parceiro atualiza a situação e o público vê evento, local, horário e há quanto tempo está ao vivo", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    test.setTimeout(90_000);
    const placeName = `Palco Contexto ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const eventTitle = `Show Contexto ${Date.now()}`;
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: eventTitle, startsInHours: -1, durationHours: 3 });
    const stream = await createLiveStream(dono, "event", eventId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    await loginAs(page, dono, "/parceiro/live");
    const card = page.getByRole("listitem").filter({ hasText: eventTitle });
    const situacao = card.getByRole("textbox", { name: `Situação atual da transmissão de ${eventTitle} · ${placeName}` });
    await situacao.fill("Casa cheia, show começa 22h");
    await card.getByRole("button", { name: "Salvar situação" }).click();
    await expect(card.getByText("Situação atualizada.")).toBeVisible();

    await page.goto(`/eventos/${eventId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.locator("video")).toBeVisible();
    await expect(live.getByText(eventTitle)).toBeVisible();
    await expect(live.getByText(placeName)).toBeVisible();
    await expect(live.getByText(/Ao vivo (agora há pouco|há \d+ min)/)).toBeVisible();
    await expect(live.getByText("Casa cheia, show começa 22h")).toBeVisible();

    // Limpar a situação: some da página (o polling traz a mudança sem recarregar).
    await page.goto("/parceiro/live");
    await situacao.fill("");
    await card.getByRole("button", { name: "Salvar situação" }).click();
    await expect(card.getByText("Situação removida.")).toBeVisible();
    await page.goto(`/eventos/${eventId}`);
    await expect(live.locator("video")).toBeVisible();
    await expect(live.getByText("Casa cheia, show começa 22h")).toHaveCount(0);
  });

  test("situação acima de 80 caracteres é recusada com mensagem", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "validação não depende da largura da tela");
    const placeName = `Bar Situação ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);
    await createLiveStream(dono, "place", placeId);
    await loginAs(page, dono, "/parceiro/live");
    const card = page.getByRole("listitem").filter({ hasText: placeName });
    const situacao = card.getByRole("textbox", { name: new RegExp(`Situação atual da transmissão de ${placeName}`) });
    // O campo limita a 80; remove o limite para simular uma requisição forjada.
    await situacao.evaluate((el) => el.removeAttribute("maxlength"));
    await situacao.fill("x".repeat(81));
    await card.getByRole("button", { name: "Salvar situação" }).click();
    await expect(card.getByText("Use até 80 caracteres.")).toBeVisible();
  });
});
