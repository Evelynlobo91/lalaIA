import { expect, test } from "@playwright/test";
import { assignPlaceTo, createApprovedPartner, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Data relativa a hoje no formato do <input type="datetime-local"> (fuso de Joinville nos testes).
function emDias(dias: number, hora: string) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`;
}

test.describe("missões do parceiro (#57)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("cria missão com etapas nos próprios lugares, edita e encerra", async ({ page }) => {
    const sufixo = Date.now();
    const cafe = await createTestPlace(`Café Missão ${sufixo}`);
    const bar = await createTestPlace(`Bar Missão ${sufixo}`);
    const user = await createConfirmedUser();
    await createApprovedPartner(user, "Café E2E");
    await assignPlaceTo(user, cafe);
    await assignPlaceTo(user, bar);
    await loginAs(page, user, "/parceiro/missoes");

    await page.getByRole("link", { name: "Nova missão" }).click();
    await page.getByLabel("Título").fill("Rota do Café E2E");
    await page.getByLabel("Descrição").fill("Prove os cafés da casa e ganhe XP.");
    await page.getByLabel("XP total").fill("90");
    await page.getByLabel("Começa em").fill(emDias(-1, "08:00"));
    await page.getByLabel("Termina em").fill(emDias(10, "20:00"));
    await page.getByLabel("O que fazer na etapa 1").fill("Peça um espresso");
    await page.getByLabel("Lugar da etapa 1").selectOption({ label: `Café Missão ${sufixo}` });
    await page.getByRole("button", { name: "Adicionar etapa" }).click();
    await page.getByLabel("O que fazer na etapa 2").fill("Prove o chope artesanal");
    await page.getByLabel("Lugar da etapa 2").selectOption({ label: `Bar Missão ${sufixo}` });
    await page.getByRole("button", { name: "Publicar missão" }).click();

    await expect(page).toHaveURL(/\/parceiro\/missoes\?salvo=/);
    const ativas = page.getByRole("region", { name: "Em andamento e agendadas" });
    await expect(ativas.getByText("Rota do Café E2E")).toBeVisible();
    await expect(ativas.getByText("2 etapas · 30 XP por etapa + 30 XP de bônus")).toBeVisible();

    await ativas.getByRole("link", { name: "Editar Rota do Café E2E" }).click();
    await expect(page.getByLabel("O que fazer na etapa 2")).toHaveValue("Prove o chope artesanal");
    await page.getByRole("button", { name: "Subir etapa 2" }).click();
    await expect(page.getByLabel("O que fazer na etapa 1")).toHaveValue("Prove o chope artesanal");
    await page.getByLabel("Título").fill("Rota do Chope E2E");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("region", { name: "Em andamento e agendadas" }).getByText("Rota do Chope E2E")).toBeVisible();

    await page.getByRole("button", { name: "Encerrar Rota do Chope E2E" }).click();
    await page.getByRole("button", { name: "Sim, encerrar" }).click();
    await expect(page.getByRole("region", { name: "Encerradas" }).getByText("Rota do Chope E2E")).toBeVisible();
  });

  test("validação: etapa sem lugar e fim antes do início, sem perder o que foi digitado", async ({ page }) => {
    const lugar = await createTestPlace(`Café Validação ${Date.now()}`);
    const lugar2 = await createTestPlace(`Bar Validação ${Date.now()}`);
    const user = await createConfirmedUser();
    await createApprovedPartner(user);
    await assignPlaceTo(user, lugar);
    await assignPlaceTo(user, lugar2);
    await loginAs(page, user, "/parceiro/missoes/nova");

    await page.getByLabel("Título").fill("Missão incompleta");
    await page.getByLabel("Descrição").fill("Descrição válida da missão.");
    await page.getByLabel("Começa em").fill(emDias(2, "20:00"));
    await page.getByLabel("Termina em").fill(emDias(2, "18:00"));
    await page.getByLabel("O que fazer na etapa 1").fill("Peça um café");
    await page.getByRole("button", { name: "Publicar missão" }).click();

    await expect(page.getByText("Etapa 1: escolha o lugar.")).toBeVisible();
    await expect(page.getByText("O fim precisa ser depois do início.")).toBeVisible();
    await expect(page.getByLabel("Título")).toHaveValue("Missão incompleta");
    await expect(page.getByLabel("O que fazer na etapa 1")).toHaveValue("Peça um café");
  });

  test("parceiro sem lugar é orientado a reivindicar um; missão de outro parceiro dá 404", async ({ page }) => {
    const user = await createConfirmedUser();
    await createApprovedPartner(user);
    await loginAs(page, user, "/parceiro/missoes/nova");
    await expect(page.getByText("Você ainda não administra nenhum lugar")).toBeVisible();

    expect((await page.goto("/parceiro/missoes/00000000-0000-4000-8000-000000000000/editar"))?.status()).toBe(404);
  });
});
