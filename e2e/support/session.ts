import { expect, type Page } from "@playwright/test";
import type { TestUser } from "./users";

/** Faz login pela tela de entrar e espera chegar ao destino. */
export async function loginAs(page: Page, user: Pick<TestUser, "email" | "password">, next = "/") {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[/?]/g, "\\$&")}$`));
}
