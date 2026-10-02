import { describe, expect, it, vi } from "vitest";
import type { EventRecord } from "../../domain/event";
import { GetEventDetail, phaseOf } from "./event-detail";

const ID = "8f0e2c6a-6a1e-4b8e-9d2a-3f4b5c6d7e8f";
const now = new Date("2026-10-10T22:00:00Z");
const record = (patch: Partial<EventRecord> = {}): EventRecord => ({
  id: ID,
  ownerId: "dono",
  placeId: "lugar",
  title: "Noite do Jazz",
  description: "Show de jazz ao vivo.",
  category: "shows",
  startsAt: new Date("2026-10-10T23:00:00Z"),
  endsAt: new Date("2026-10-11T02:00:00Z"),
  priceCents: 5000,
  status: "scheduled",
  createdAt: now,
  ...patch,
});

describe("phaseOf", () => {
  it.each([
    ["scheduled", "2026-10-10T23:00:00Z", "2026-10-11T01:00:00Z", "upcoming"],
    ["scheduled", "2026-10-10T21:00:00Z", "2026-10-11T01:00:00Z", "happening"],
    ["scheduled", "2026-10-10T19:00:00Z", "2026-10-10T21:00:00Z", "finished"],
    ["cancelled", "2026-10-10T23:00:00Z", "2026-10-11T01:00:00Z", "cancelled"],
  ] as const)("%s %s→%s = %s", (status, s, e, phase) => {
    expect(phaseOf(status, new Date(s), new Date(e), now)).toBe(phase);
  });
});

describe("GetEventDetail", () => {
  const places = { detail: vi.fn().mockResolvedValue({ id: "lugar", name: "Teatro", address: "Rua X, 1 - Centro, Joinville - SC", directionsUrl: "https://maps" }) };

  it("monta a visão com lugar, quando, preço e fase", async () => {
    const res = await new GetEventDetail({ findById: vi.fn().mockResolvedValue(record()) }, places, () => now).execute(ID);
    expect(res.ok && res.value).toMatchObject({
      title: "Noite do Jazz",
      categoryLabel: "Shows e música",
      phase: "upcoming",
      priceLabel: expect.stringMatching(/A partir de R\$\s?50,00/),
      whenLabel: expect.stringMatching(/20:00 – 23:00$/),
      place: { name: "Teatro", directionsUrl: "https://maps" },
    });
  });

  it("evento cancelado continua acessível, com a fase certa", async () => {
    const res = await new GetEventDetail({ findById: vi.fn().mockResolvedValue(record({ status: "cancelled" })) }, places, () => now).execute(ID);
    expect(res.ok && res.value.phase).toBe("cancelled");
  });

  it("id inválido não consulta o banco; inexistente → não encontrado", async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null) };
    expect((await new GetEventDetail(repo, places).execute("../x")).ok).toBe(false);
    expect(repo.findById).not.toHaveBeenCalled();
    expect((await new GetEventDetail(repo, places).execute(ID)).ok).toBe(false);
  });
});
