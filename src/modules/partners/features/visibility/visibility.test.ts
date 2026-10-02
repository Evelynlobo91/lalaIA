import { describe, expect, it, vi } from "vitest";
import { EndSponsorship, EndSponsorshipsWithoutPlan, ListMySponsorships, MAX_ACTIVE_SPONSORSHIPS, StartSponsorship, startSponsorshipSchema, type Sponsorship } from "./visibility.use-cases";

const PLACE = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const EVENT = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const now = new Date("2026-10-02T12:00:00Z");
const sponsor = { userId: "dona", partnerId: "p1" };
const place = { type: "place" as const, id: PLACE };

const sponsorship = (patch: Partial<Sponsorship> = {}): Sponsorship => ({ id: "s1", partnerId: "p1", target: place, startsAt: now, endsAt: new Date("2026-10-09T12:00:00Z"), status: "active", ...patch });

const deps = (opts: { entitled?: boolean; mine?: Sponsorship[]; created?: Sponsorship | null } = {}) => {
  const repo = { create: vi.fn().mockResolvedValue(opts.created === undefined ? sponsorship() : opts.created), listByPartner: vi.fn().mockResolvedValue(opts.mine ?? []) };
  const targets = { ownedBy: vi.fn().mockResolvedValue([{ ...place, name: "Bar da Dona" }]) };
  const entitled = vi.fn().mockResolvedValue(opts.entitled ?? true);
  return { repo, targets, entitled, useCase: new StartSponsorship(repo, targets, entitled, () => now) };
};

describe("startSponsorshipSchema", () => {
  it("lê o alvo (tipo:id) e o período", () => {
    expect(startSponsorshipSchema.parse({ target: `event:${EVENT.toUpperCase()}`, days: "15" })).toEqual({ target: { type: "event", id: EVENT }, days: 15 });
  });

  it("recusa alvo malformado, tipo desconhecido e período fora das opções", () => {
    expect(startSponsorshipSchema.safeParse({ target: "place:123", days: "7" }).success).toBe(false);
    expect(startSponsorshipSchema.safeParse({ target: `mission:${PLACE}`, days: "7" }).success).toBe(false);
    expect(startSponsorshipSchema.safeParse({ target: `place:${PLACE}`, days: "10" }).success).toBe(false);
  });
});

describe("StartSponsorship", () => {
  it("destaca um lugar do parceiro pelo período escolhido, a partir de agora", async () => {
    const { repo, useCase } = deps();
    const result = await useCase.execute(sponsor, place, 7);
    expect(result.ok).toBe(true);
    expect(repo.create).toHaveBeenCalledWith("dona", "p1", place, now, new Date("2026-10-09T12:00:00Z"));
  });

  it("plano sem destaque: recusa antes de olhar qualquer outra coisa", async () => {
    const { repo, targets, useCase } = deps({ entitled: false });
    const result = await useCase.execute(sponsor, place, 7);
    expect(!result.ok && result.error.code).toBe("plan_feature_required");
    expect(targets.ownedBy).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("só destaca o que é do próprio parceiro", async () => {
    const { repo, useCase } = deps();
    const result = await useCase.execute(sponsor, { type: "event", id: EVENT }, 7);
    expect(!result.ok && result.error.code).toBe("validation_failed");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("alvo que já está em destaque dá conflito (pelo próprio parceiro ou na corrida com outro pedido)", async () => {
    const mine = deps({ mine: [sponsorship()] });
    const r1 = await mine.useCase.execute(sponsor, place, 7);
    expect(!r1.ok && r1.error.code).toBe("conflict");
    expect(mine.repo.create).not.toHaveBeenCalled();

    const race = deps({ created: null });
    const r2 = await race.useCase.execute(sponsor, place, 7);
    expect(!r2.ok && r2.error.code).toBe("conflict");
  });

  it(`no máximo ${MAX_ACTIVE_SPONSORSHIPS} destaques valendo ao mesmo tempo; encerrados e vencidos não contam`, async () => {
    const other = (id: string, patch: Partial<Sponsorship> = {}) => sponsorship({ id, target: { type: "event", id: `${id}c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b9${id}` }, ...patch });
    const full = deps({ mine: [other("1"), other("2"), other("3")] });
    const blocked = await full.useCase.execute(sponsor, place, 7);
    expect(!blocked.ok && blocked.error.code).toBe("too_many_sponsorships");

    const withOld = deps({ mine: [other("1"), other("2"), other("3", { status: "ended" }), other("4", { endsAt: new Date("2026-10-01T00:00:00Z") })] });
    expect((await withOld.useCase.execute(sponsor, place, 7)).ok).toBe(true);
  });
});

describe("EndSponsorship / ListMySponsorships", () => {
  it("encerra o próprio destaque; inexistente ou de outro parceiro → não encontrado", async () => {
    const end = vi.fn().mockResolvedValueOnce(sponsorship({ status: "ended" })).mockResolvedValueOnce(null);
    expect((await new EndSponsorship({ end }).execute(sponsor, "s1")).ok).toBe(true);
    expect(end).toHaveBeenCalledWith("dona", "p1", "s1");
    const missing = await new EndSponsorship({ end }).execute(sponsor, "s1");
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });

  it("lista com o nome do alvo e se ainda está valendo", async () => {
    const listByPartner = vi.fn().mockResolvedValue([sponsorship(), sponsorship({ id: "s2", status: "ended" }), sponsorship({ id: "s3", endsAt: new Date("2026-10-01T00:00:00Z"), target: { type: "event", id: EVENT } })]);
    const names = vi.fn().mockResolvedValue(new Map([[`place:${PLACE}`, "Bar da Dona"]]));
    const items = await new ListMySponsorships({ listByPartner }, { names }, () => now).execute(sponsor);
    expect(items.map((i) => [i.id, i.targetName, i.running])).toEqual([
      ["s1", "Bar da Dona", true],
      ["s2", "Bar da Dona", false],
      ["s3", "Removido", false],
    ]);
  });
});

describe("EndSponsorshipsWithoutPlan", () => {
  it("conta que perdeu o direito ao destaque tem os destaques encerrados; quem ainda tem direito, não", async () => {
    const endAllOf = vi.fn().mockResolvedValue(2);
    expect(await new EndSponsorshipsWithoutPlan({ endAllOf }, async () => false).execute("dona")).toBe(2);
    expect(await new EndSponsorshipsWithoutPlan({ endAllOf }, async () => true).execute("dona")).toBe(0);
    expect(endAllOf).toHaveBeenCalledTimes(1);
  });
});
