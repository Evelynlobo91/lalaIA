import { expect, test } from "@playwright/test";
import { createApprovedPartner, createRedeemedOffer } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

test.describe("equipe do parceiro (#158)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo da equipe roda só no celular");
  });

  test("dono convida um funcionário, que só valida códigos no balcão; removido, perde o acesso na hora", async ({ page, browser }) => {
    const bar = `Bar da Equipe ${Date.now()}`;
    const dono = await createConfirmedUser("Dona do Bar");
    const caixa = await createConfirmedUser("Caixa do Bar");
    const cliente = await createConfirmedUser("Cliente");
    await createApprovedPartner(dono, bar);
    await createRedeemedOffer(dono, cliente, "Chope em dobro da equipe", "EQPA2345");
    await createRedeemedOffer(dono, cliente, "Petisco da equipe", "EQPB2345");

    // Antes do convite, o balcão não existe para o funcionário.
    const context = await browser.newContext();
    const balcao = await context.newPage();
    await loginAs(balcao, caixa, "/perfil");
    await balcao.goto("/parceiro/balcao");
    await expect(balcao).toHaveURL(/\/parceiro$/);
    await expect(balcao.getByText("Você faz parte de uma equipe")).toHaveCount(0);

    // Dono convida pelo e-mail.
    await loginAs(page, dono, "/parceiro/inicio");
    await page.getByRole("navigation", { name: "Portal do parceiro" }).getByRole("link", { name: "Equipe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Equipe" })).toBeVisible();
    await expect(page.getByText("Ninguém na equipe ainda.")).toBeVisible();
    const convite = page.getByRole("form", { name: "Convidar para a equipe" });
    await convite.getByLabel("E-mail do funcionário").fill(dono.email);
    await convite.getByRole("button", { name: "Convidar" }).click();
    await expect(page.getByText("Este é o seu e-mail: você já tem acesso total.")).toBeVisible();
    await convite.getByLabel("E-mail do funcionário").fill(caixa.email.toUpperCase());
    await convite.getByRole("button", { name: "Convidar" }).click();
    await expect(page.getByRole("heading", { name: "Membros (1)" })).toBeVisible();
    const membros = page.getByRole("list", { name: "Membros da equipe" });
    await expect(membros).toContainText(caixa.email);
    await expect(membros).toContainText("Com acesso");

    // O funcionário entra pelo "Portal do parceiro" e chega só ao balcão.
    await balcao.goto("/parceiro");
    await expect(balcao.getByText(`Atende no balcão de ${bar}.`)).toBeVisible();
    await balcao.getByRole("link", { name: "Abrir o balcão" }).click();
    await expect(balcao).toHaveURL(/\/parceiro\/balcao$/);
    await expect(balcao.getByRole("heading", { level: 1, name: bar })).toBeVisible();
    await balcao.getByLabel("Código do cliente").fill("eqpa-2345");
    await balcao.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(balcao.getByRole("status").filter({ hasText: "validado" })).toContainText("Chope em dobro da equipe");

    // O resto do portal continua fechado para ele.
    for (const rota of ["/parceiro/assinatura", "/parceiro/dados", "/parceiro/equipe", "/parceiro/ofertas"]) {
      await balcao.goto(rota);
      await expect(balcao).toHaveURL(/\/parceiro$/);
    }

    // Removido com a tela do balcão aberta: a próxima validação já é recusada.
    await balcao.goto("/parceiro/balcao");
    await membros.getByRole("button", { name: `Remover ${caixa.email} da equipe` }).click();
    await expect(page.getByRole("heading", { name: "Membros (0)" })).toBeVisible();
    await balcao.getByLabel("Código do cliente").fill("EQPB-2345");
    await balcao.getByRole("button", { name: "Validar", exact: true }).click();
    await expect(balcao.getByRole("alert").filter({ hasText: "balcão" })).toHaveText("Você não atende no balcão de nenhum parceiro.");
    await balcao.goto("/parceiro/balcao");
    await expect(balcao).toHaveURL(/\/parceiro$/);
    await context.close();
  });
});
