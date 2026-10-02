import { expect, test } from "@playwright/test";
import { createApprovedPartner, createLiveCta, createLiveStream, createTestPlace, isolatedPoint, setLiveControl } from "./support/db";
import { sendLiveWebhook } from "./support/live";
import { createConfirmedUser } from "./support/users";

// A chamada chega pelo polling do status (~12 s).
const cycle = { timeout: 30_000 };

test.describe("chamada do anfitrião no player (#179, #180)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo da chamada roda só no celular");
  });

  test("aparece sozinha quando a live entra no ar, uma por vez (prioridade), e some se for fechada ou a live pausar", async ({ page, request, browser }) => {
    test.setTimeout(120_000);
    const placeId = await createTestPlace(`Bar da Chamada ${Date.now()}`, isolatedPoint());
    const dono = await createConfirmedUser("Dona da Chamada");
    await createApprovedPartner(dono, "Bar da Chamada");
    const stream = await createLiveStream(dono, "place", placeId);
    await createLiveCta(stream.id, { title: "Siga o bar", href: "https://instagram.com/bardachamada", startsInMinutes: -5, durationMinutes: 60 });
    await createLiveCta(stream.id, { title: "Missão da casa", body: "Complete e ganhe XP.", href: "/missoes", buttonLabel: "Ver missões", type: "missao", priority: 1, offsetMinutes: 0, durationMinutes: 60 });

    // Aguardando sinal: nenhuma chamada.
    await page.goto(`/lugares/${placeId}`);
    const live = page.getByRole("region", { name: "Transmissão ao vivo" });
    await expect(live.getByText("Aguardando sinal")).toBeVisible();
    const chamada = page.getByRole("complementary", { name: "Chamada do anfitrião" });
    await expect(chamada).toHaveCount(0);

    // Entrou no ar: a de maior prioridade aparece sem recarregar; a outra espera.
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");
    await expect(chamada).toBeVisible(cycle);
    await expect(chamada).toContainText("Missão da casa");
    await expect(chamada).toContainText("Complete e ganhe XP.");
    await expect(page.getByText("Siga o bar")).toHaveCount(0);
    await expect(chamada.getByRole("link", { name: "Ver missões" })).toHaveAttribute("href", "/missoes");
    // Não alarga a página no celular.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    // Fechada, não volta na mesma sessão (nem recarregando).
    await chamada.getByRole("button", { name: "Fechar a chamada" }).click();
    await expect(chamada).toHaveCount(0);
    await page.reload();
    await expect(live.locator("video")).toBeVisible();
    await expect(chamada).toHaveCount(0);

    // Outra pessoa vê a chamada.
    const context = await browser.newContext();
    const outra = await context.newPage();
    await outra.goto(`/lugares/${placeId}`);
    const chamadaOutra = outra.getByRole("complementary", { name: "Chamada do anfitrião" });
    await expect(chamadaOutra).toContainText("Missão da casa");

    // Live pausada: a chamada some sozinha; retomada, volta.
    await setLiveControl(stream.id, "paused");
    await expect(outra.getByText("Transmissão pausada")).toBeVisible(cycle);
    await expect(chamadaOutra).toHaveCount(0);
    await setLiveControl(stream.id, "on");
    await expect(chamadaOutra).toBeVisible(cycle);

    // O toque leva ao destino.
    await chamadaOutra.getByRole("link", { name: "Ver missões" }).click();
    await expect(outra).toHaveURL(/\/missoes$/);
    await context.close();
  });

  test("link externo abre em nova aba; fora da janela não aparece", async ({ page, request }) => {
    const placeId = await createTestPlace(`Bar do Link ${Date.now()}`, isolatedPoint());
    const dono = await createConfirmedUser("Dona do Link");
    await createApprovedPartner(dono, "Bar do Link");
    const stream = await createLiveStream(dono, "place", placeId);
    await createLiveCta(stream.id, { title: "Reserve sua mesa", href: "https://instagram.com/bardolink", buttonLabel: "Reservar", startsInMinutes: -5, durationMinutes: 60 });
    await createLiveCta(stream.id, { title: "Só mais tarde", href: "/missoes", priority: 1, offsetMinutes: 120, durationMinutes: 10 });
    await sendLiveWebhook(request, stream.providerStreamId, "video.live_stream.active");

    await page.goto(`/lugares/${placeId}`);
    const chamada = page.getByRole("complementary", { name: "Chamada do anfitrião" });
    await expect(chamada).toContainText("Reserve sua mesa");
    const link = chamada.getByRole("link", { name: /Reservar/ });
    await expect(link).toHaveAttribute("href", "https://instagram.com/bardolink");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(page.getByText("Só mais tarde")).toHaveCount(0);
  });
});
