import { expect, test, type Page } from "@playwright/test";
import { createApprovedPartner, createTestPlace } from "./support/db";
import { loginAs } from "./support/session";
import { createConfirmedUser } from "./support/users";

// Data futura no formato do <input type="datetime-local"> (horário local do navegador, fuso de Joinville nos testes).
function emDias(dias: number, hora: string) {
  const d = new Date(Date.now() + dias * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`;
}

async function escolherLugar(page: Page, nome: string) {
  await page.getByRole("combobox", { name: "Onde vai ser" }).fill(nome);
  await page.getByRole("option", { name: new RegExp(nome) }).click();
}

test.describe("eventos do parceiro (#36)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "celular-360", "fluxo de conta roda só no celular");
  });

  test("cria, edita e cancela um evento", async ({ page }) => {
    const lugar = `Casa de Shows E2E ${Date.now()}`;
    await createTestPlace(lugar);
    const user = await createConfirmedUser();
    await createApprovedPartner(user, "Produtora E2E");
    await loginAs(page, user, "/parceiro/eventos");

    await page.getByRole("link", { name: "Novo evento" }).click();
    await page.getByLabel("Título").fill("Noite do Samba");
    await escolherLugar(page, lugar);
    await page.getByLabel("Categoria").selectOption({ label: "Shows e música" });
    await page.getByLabel("Começa em").fill(emDias(3, "20:00"));
    await page.getByLabel("Termina em").fill(emDias(3, "23:30"));
    await page.getByLabel(/Valor/).fill("30");
    await page.getByLabel("Descrição").fill("Roda de samba ao vivo com convidados.");
    await page.getByRole("button", { name: "Publicar evento" }).click();

    await expect(page).toHaveURL(/\/parceiro\/eventos\?salvo=/);
    const proximos = page.getByRole("region", { name: "Próximos" });
    await expect(proximos.getByText("Noite do Samba")).toBeVisible();
    await expect(proximos.getByText(/A partir de R\$\s?30,00/)).toBeVisible();
    await expect(proximos.getByText(lugar)).toBeVisible();

    await proximos.getByRole("link", { name: "Editar Noite do Samba" }).click();
    await page.getByLabel("Título").fill("Noite do Samba e Pagode");
    await page.getByLabel(/Valor/).fill("");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("region", { name: "Próximos" }).getByText("Grátis")).toBeVisible();

    await page.getByRole("button", { name: "Cancelar Noite do Samba e Pagode" }).click();
    await page.getByRole("button", { name: "Sim, cancelar" }).click();
    await expect(page.getByRole("region", { name: "Cancelados" }).getByText("Noite do Samba e Pagode")).toBeVisible();
  });

  test("validação: sem lugar e término antes do início", async ({ page }) => {
    const user = await createConfirmedUser();
    await createApprovedPartner(user);
    await loginAs(page, user, "/parceiro/eventos/novo");

    await page.getByLabel("Título").fill("Evento sem lugar");
    await page.getByLabel("Categoria").selectOption({ label: "Feiras e mercados" });
    await page.getByLabel("Começa em").fill(emDias(2, "20:00"));
    await page.getByLabel("Termina em").fill(emDias(2, "18:00"));
    await page.getByLabel("Descrição").fill("Descrição válida do evento.");
    await page.getByRole("button", { name: "Publicar evento" }).click();

    await expect(page.getByText("Escolha o lugar do evento.")).toBeVisible();
    await expect(page.getByText("O término precisa ser depois do início.")).toBeVisible();
    await expect(page.getByLabel("Título")).toHaveValue("Evento sem lugar");
  });

  test("evento de outro parceiro não abre para edição (404)", async ({ page, browser }) => {
    const lugar = `Bar E2E ${Date.now()}`;
    await createTestPlace(lugar);
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono);
    const donoPage = await (await browser.newContext()).newPage();
    await loginAs(donoPage, dono, "/parceiro/eventos/novo");
    await donoPage.getByLabel("Título").fill("Evento do Dono");
    await escolherLugar(donoPage, lugar);
    await donoPage.getByLabel("Categoria").selectOption({ label: "Bares" });
    await donoPage.getByLabel("Começa em").fill(emDias(4, "19:00"));
    await donoPage.getByLabel("Termina em").fill(emDias(4, "22:00"));
    await donoPage.getByLabel("Descrição").fill("Happy hour com música.");
    await donoPage.getByRole("button", { name: "Publicar evento" }).click();
    await expect(donoPage).toHaveURL(/salvo=/);
    const eventId = new URL(donoPage.url()).searchParams.get("salvo");

    const outro = await createConfirmedUser();
    await createApprovedPartner(outro);
    await loginAs(page, outro, "/parceiro/eventos");
    expect((await page.goto(`/parceiro/eventos/${eventId}/editar`))?.status()).toBe(404);
  });
});
