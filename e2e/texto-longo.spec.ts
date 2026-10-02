import { expect, test } from "@playwright/test";
import { createApprovedPartner, createTestEvent, createTestMission, createTestPlace, isolatedPoint } from "./support/db";
import { createConfirmedUser } from "./support/users";

test.describe("texto longo sem espaços", () => {
  test("títulos e nomes compridos não criam rolagem horizontal nas listas", async ({ page }, testInfo) => {
    // Palavra comprida sem espaço (ex.: nome colado, hashtag, link): não pode alargar a página.
    const longa = `Superextraordinariamentelonga${Date.now()}${testInfo.project.name.replace(/W/g, "")}semespacos`;
    const dono = await createConfirmedUser();
    await createApprovedPartner(dono, `Casa ${longa}`);
    const placeId = await createTestPlace(`Lugar ${longa}`, isolatedPoint());
    const eventId = await createTestEvent({ ownerEmail: dono.email, placeId, title: `Show ${longa}`, startsInHours: 1, durationHours: 2 });
    const { missionId } = await createTestMission({ ownerEmail: dono.email, title: `Rota ${longa}`, steps: [{ title: `Etapa ${longa}`, placeId }] });

    for (const path of ["/missoes", `/missoes/${missionId}`, `/eventos/${eventId}`, `/lugares/${placeId}`, `/buscar?q=${longa.slice(0, 20)}`]) {
      await page.goto(path);
      await expect(page.getByText(longa).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${testInfo.project.name}: rolagem horizontal em ${path}`).toBeLessThanOrEqual(0);
    }
  });
});
