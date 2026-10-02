import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

function emDias(dias: number, hora: string) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`;
}

// Fluxo completo do núcleo da gamificação: #57 → #58 → #60 → #65.
test("parceiro cria missão → explorador aceita → valida o QR → XP aparece no perfil", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  const sufixo = Date.now();
  const lugar = `Café Fluxo ${sufixo}`;
  const placeId = await createTestPlace(lugar);
  const parceiro = await createConfirmedUser();
  await createApprovedPartner(parceiro, "Café do Fluxo");
  await assignPlaceTo(parceiro, placeId);

  // 1. Parceiro cria a missão no portal (1 etapa, 60 XP → 30 da etapa + 30 de bônus).
  const portal = await (await browser.newContext()).newPage();
  await loginAs(portal, parceiro, "/parceiro/missoes/nova");
  const titulo = `Missão Fluxo ${sufixo}`;
  await portal.getByLabel("Título").fill(titulo);
  await portal.getByLabel("Descrição").fill("Venha provar o café da casa e ganhe XP.");
  await portal.getByLabel("XP total").fill("60");
  await portal.getByLabel("Começa em").fill(emDias(-1, "08:00"));
  await portal.getByLabel("Termina em").fill(emDias(5, "20:00"));
  await portal.getByLabel("O que fazer na etapa 1").fill("Peça o café da casa");
  // Com um único lugar administrado, ele já vem escolhido.
  await expect(portal.getByLabel("Lugar da etapa 1")).toHaveValue(placeId);
  await portal.getByRole("button", { name: "Publicar missão" }).click();
  await expect(portal).toHaveURL(/salvo=/);

  // 2. Explorador aceita.
  const explorador = await createConfirmedUser("Exploradora XP");
  await loginAs(page, explorador, "/missoes");
  await page.getByRole("button", { name: `Aceitar ${titulo}` }).click();
  await expect(page.getByText("Missão aceita! Boa exploração.")).toBeVisible();

  // 3. Parceiro mostra o QR; explorador abre o link e conclui.
  await portal.getByRole("link", { name: `QR codes de ${titulo}` }).click();
  const qrUrl = new URL((await portal.getByRole("img", { name: /QR code da etapa 1/ }).getAttribute("data-qr-url"))!);
  await page.goto(qrUrl.pathname + qrUrl.search);
  await page.getByRole("button", { name: "Concluir etapa" }).click();
  await expect(page.getByText("Etapa 1 concluída! +30 XP. Missão concluída! +30 XP de bônus.")).toBeVisible();

  // 4. XP no perfil: saldo e histórico.
  await page.goto("/perfil");
  const xp = page.getByRole("article", { name: "Seu XP" });
  await expect(xp.getByText("60 XP", { exact: true })).toBeVisible();
  const historico = xp.getByRole("list", { name: "Histórico de XP" });
  await expect(historico.getByText(`Etapa concluída · ${titulo}`)).toBeVisible();
  await expect(historico.getByText(`Missão concluída · ${titulo}`)).toBeVisible();

  // Reabrir o QR não credita de novo.
  await page.goto(qrUrl.pathname + qrUrl.search);
  await expect(page.getByText(/já concluiu esta missão|já concluiu esta etapa/)).toBeVisible();
  await page.goto("/perfil");
  await expect(page.getByRole("article", { name: "Seu XP" }).getByText("60 XP", { exact: true })).toBeVisible();
});
