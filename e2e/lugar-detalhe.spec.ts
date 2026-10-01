import { expect, test } from "@playwright/test";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Um lugar real do snapshot com endereço, telefone, site e horário.
async function lugarCompleto(): Promise<{ id: string; name: string }> {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    const [row] = await sql<{ id: string; name: string }[]>`
      select id, name from places.places
      where street is not null and phone is not null and website is not null and opening_hours is not null
      order by name limit 1`;
    return row;
  } finally {
    await sql.end();
  }
}

test.describe("detalhe do lugar (RF06, RF10)", () => {
  test("abre pela lista e mostra nome, categoria e como chegar", async ({ page }) => {
    await page.goto("/lugares");
    const primeiro = page.getByRole("list", { name: "Lugares" }).getByRole("link").first();
    const nome = (await primeiro.getByRole("heading").textContent())!;
    await primeiro.click();

    await expect(page).toHaveURL(/\/lugares\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("link", { name: "Como chegar" })).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-26\.\d+,-48\.\d+$/);
  });

  test("lugar com dados completos mostra endereço, telefone, site e horário", async ({ page }) => {
    const lugar = await lugarCompleto();
    await page.goto(`/lugares/${lugar.id}`);

    await expect(page.getByRole("region", { name: "Endereço" })).toContainText("Joinville - SC");
    const telefones = page.getByRole("region", { name: "Telefone" }).getByRole("link");
    await expect(telefones.first()).toHaveAttribute("href", /^tel:\+?\d+$/);
    // Campo com vários números vira um link por número.
    for (const tel of await telefones.all()) await expect(tel).toHaveAttribute("href", /^tel:\+?\d{8,}$/);
    const site = page.getByRole("region", { name: "Site" }).getByRole("link");
    await expect(site).toHaveAttribute("href", /^https?:\/\//);
    await expect(site).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("region", { name: "Horário de funcionamento" })).toBeVisible();
    await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toBeVisible();
  });

  test("metadados de compartilhamento (Open Graph) com URL absoluta e imagem gerada", async ({ page, request }) => {
    const lugar = await lugarCompleto();
    await page.goto(`/lugares/${lugar.id}`);

    await expect(page).toHaveTitle(`${lugar.name} · LalaIA`);
    const og = (property: string) => page.locator(`meta[property="${property}"]`);
    await expect(og("og:title")).toHaveAttribute("content", `${lugar.name} · LalaIA`);
    await expect(og("og:url")).toHaveAttribute("content", new RegExp(`^https?://[^/]+/lugares/${lugar.id}$`));
    await expect(og("og:locale")).toHaveAttribute("content", "pt_BR");

    const imageUrl = (await og("og:image").getAttribute("content"))!;
    expect(imageUrl).toMatch(/^https?:\/\//);
    const image = await request.get(new URL(imageUrl).pathname + new URL(imageUrl).search);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  });

  test("id inexistente ou inválido mostra 'lugar não encontrado' com status 404", async ({ page }) => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "nao-e-um-id"]) {
      const res = await page.goto(`/lugares/${id}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByText("Lugar não encontrado")).toBeVisible();
    }
  });
});
