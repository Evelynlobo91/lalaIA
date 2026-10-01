import type { Locator, Page } from "@playwright/test";

/**
 * Procura um item numa lista paginada, clicando em "Carregar mais" até achar (como faria a pessoa).
 * O banco local acumula dados de testes anteriores, então o item nem sempre está na primeira página.
 */
export async function findInPagedList(page: Page, list: Locator, text: string | RegExp, maxPages = 15): Promise<Locator> {
  const item = list.getByRole("listitem").filter({ hasText: text });
  for (let i = 0; i < maxPages; i++) {
    if ((await item.count()) > 0) return item.first();
    const more = page.getByRole("button", { name: "Carregar mais" });
    if ((await more.count()) === 0) break;
    const before = await list.getByRole("listitem").count();
    await more.click();
    await page.waitForFunction(
      ([selector, n]) => document.querySelectorAll(selector as string).length > (n as number),
      [`ul[aria-label="${await list.getAttribute("aria-label")}"] > li`, before],
    );
  }
  return item.first();
}
