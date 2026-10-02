import { expect, test } from "@playwright/test";
import { acceptLiveGuidelines, assignPlaceTo, createApprovedPartner, createLiveStream, createTestPlace, liveStreamOf, setLiveControl } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("Live: diretrizes de privacidade e enquadramento (#55)", () => {
  test("sem o aceite não gera a chave; checklist incompleto é recusado; aceite fica registrado com a data", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Privacidade ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);

    await loginAs(page, dono, "/parceiro/live");
    await expect(page.getByRole("heading", { name: "Como posicionar a câmera" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: placeName });
    const gerar = card.getByRole("button", { name: `Gerar chave de transmissão para ${placeName}` });
    await expect(gerar).toBeDisabled();
    await expect(card.getByText("Aceite as diretrizes de privacidade acima para gerar a chave.")).toBeVisible();

    // Só um item marcado: os outros pedem confirmação, e nada é registrado.
    const checklist = page.getByRole("form", { name: "Diretrizes de privacidade da live" });
    await checklist.getByRole("checkbox").first().check();
    await checklist.getByRole("button", { name: "Aceitar as diretrizes" }).click();
    await expect(checklist.getByText("Confirme este item para continuar.").first()).toBeVisible();
    await expect(gerar).toBeDisabled();

    for (const box of await checklist.getByRole("checkbox").all()) await box.check();
    await checklist.getByRole("button", { name: "Aceitar as diretrizes" }).click();
    await expect(page.getByText(/Diretrizes aceitas em/)).toBeVisible();
    await expect(checklist).toHaveCount(0);

    await gerar.click();
    await expect(card.getByText("Aguardando sinal")).toBeVisible();
    expect(await liveStreamOf(placeId)).not.toBeNull();
  });

  test("sem o aceite, 'Ativar' fica bloqueado no portal", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo não depende da largura da tela");
    const placeName = `Bar Sem Aceite ${Date.now()}`;
    const placeId = await createTestPlace(placeName);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    await assignPlaceTo(dono, placeId);
    // Transmissão criada antes das diretrizes (direto no banco) e pausada.
    const stream = await createLiveStream(dono, "place", placeId);
    await setLiveControl(stream.id, "paused");

    await loginAs(page, dono, "/parceiro/live");
    const card = page.getByRole("listitem").filter({ hasText: placeName });
    await expect(card.getByRole("button", { name: `Ativar a transmissão de ${placeName}` })).toBeDisabled();
    await expect(card.getByText("Aceite as diretrizes de privacidade acima para ativar.")).toBeVisible();

    await acceptLiveGuidelines(dono);
    await page.reload();
    await card.getByRole("button", { name: `Ativar a transmissão de ${placeName}` }).click();
    await expect(card.getByText("Aguardando sinal")).toBeVisible();
  });

  test("página pública mostra aviso curto de privacidade perto do player", async ({ page, request }) => {
    const placeId = await createTestPlace(`Bar Aviso ${Date.now()}`);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const stream = await createLiveStream(dono, "place", placeId);
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.locator("video")).toBeVisible();
    await expect(live.getByText(/sem áudio e sem gravação/)).toBeVisible();
  });
});
