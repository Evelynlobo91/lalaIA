import { describe, expect, it, vi } from "vitest";
import { LIVE_GUIDELINES_VERSION, type PrivacyAgreement, type PrivacyAgreements } from "../../domain/privacy";
import { statusOf, type LiveActor, type StreamControl, type StreamRecord } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { ControlStream } from "../stream-control/stream-control.use-case";
import { ProvisionStream } from "../stream-key/stream-key.use-case";
import { acceptGuidelinesSchema } from "./privacy.schema";
import { AcceptLiveGuidelines, PrivacyGate } from "./privacy.use-case";

const ana: LiveActor = { id: "ana", isPartner: true, isAdmin: false };
const admin: LiveActor = { id: "adm", isPartner: false, isAdmin: true };
const leo: LiveActor = { id: "leo", isPartner: false, isAdmin: false };
const at = new Date("2026-10-01T12:00:00Z");

function agreements(initial: Record<string, PrivacyAgreement> = {}): PrivacyAgreements & { store: Record<string, PrivacyAgreement> } {
  const store = { ...initial };
  return {
    store,
    find: vi.fn(async (userId: string) => store[userId] ?? null),
    accept: vi.fn(async (userId: string, version: string) => (store[userId] = { version, acceptedAt: at })),
  };
}

const record = (control: StreamControl = "paused"): StreamRecord => ({
  id: "s1",
  ownerId: "ana",
  entityType: "place",
  entityId: "p1",
  provider: "fake",
  providerStreamId: "ls-1",
  playbackId: "pb",
  control,
  signal: "live",
  status: statusOf(control, "live"),
  signalChangedAt: at,
  createdAt: at,
  note: null,
});

describe("AcceptLiveGuidelines (#55)", () => {
  it("registra o aceite com a data e a versão vigente; repetir não grava de novo", async () => {
    const repo = agreements();
    const result = await new AcceptLiveGuidelines(repo).execute(ana);
    expect(result).toEqual({ ok: true, value: { version: LIVE_GUIDELINES_VERSION, acceptedAt: at } });
    await new AcceptLiveGuidelines(repo).execute(ana);
    expect(repo.accept).toHaveBeenCalledOnce();
  });

  it("aceite de versão antiga é renovado; quem não é parceiro não aceita", async () => {
    const repo = agreements({ ana: { version: "2020-01", acceptedAt: at } });
    await new AcceptLiveGuidelines(repo).execute(ana);
    expect(repo.store.ana!.version).toBe(LIVE_GUIDELINES_VERSION);

    const denied = await new AcceptLiveGuidelines(repo).execute(leo);
    expect(!denied.ok && denied.error.code).toBe("forbidden");
  });

  it("checklist: todos os itens marcados e a versão que a pessoa leu", () => {
    const all = { version: LIVE_GUIDELINES_VERSION, wideHighShot: "on", noAudio: "on", physicalNotice: "on", lgpd: "on" };
    expect(acceptGuidelinesSchema.safeParse(all).success).toBe(true);
    const missing = acceptGuidelinesSchema.safeParse({ ...all, noAudio: undefined });
    expect(!missing.success && missing.error.issues[0]?.message).toBe("Confirme este item para continuar.");
    expect(acceptGuidelinesSchema.safeParse({ ...all, version: "2020-01" }).success).toBe(false);
  });
});

describe("PrivacyGate: sem aceite, nada vai ao ar (#55)", () => {
  const provider = {
    name: "fake",
    createStream: vi.fn(async () => ({ providerStreamId: "ls-1", streamKey: "chave-secreta-1234567890", playbackId: "pb" })),
    enable: vi.fn(),
    disable: vi.fn(),
  } as unknown as StreamingProvider;

  it("bloqueia gerar a chave sem o aceite (nem chama o provedor)", async () => {
    const streams = { findById: vi.fn(), findByTarget: vi.fn(async () => null), listByOwner: vi.fn(), create: vi.fn(), saveKey: vi.fn(), keyFor: vi.fn() };
    const targets = { owns: vi.fn(async () => true), optionsFor: vi.fn() };
    const useCase = new ProvisionStream(streams, targets, () => provider, new PrivacyGate(agreements()));
    const result = await useCase.execute(ana, { entityType: "place", entityId: "p1" });
    expect(!result.ok && result.error.code).toBe("privacy_guidelines_required");
    expect(!result.ok && result.error.message).toMatch(/gerar a chave/);
    expect(provider.createStream).not.toHaveBeenCalled();
    expect(streams.create).not.toHaveBeenCalled();
  });

  it("bloqueia ativar sem o aceite do dono, mesmo para admin; pausar e encerrar continuam livres", async () => {
    const setControl = vi.fn(async (_a: string, _id: string, change: { control: StreamControl }) => record(change.control));
    const make = (repo: PrivacyAgreements) => new ControlStream({ findById: async () => record("paused") }, { setControl }, () => provider, { publish: vi.fn() }, new PrivacyGate(repo));

    for (const actor of [ana, admin]) {
      const denied = await make(agreements()).execute(actor, "s1", "activate");
      expect(!denied.ok && denied.error.code).toBe("privacy_guidelines_required");
    }
    expect(setControl).not.toHaveBeenCalled();
    expect((await make(agreements()).execute(ana, "s1", "end")).ok).toBe(true);

    // Aceite de versão antiga não vale.
    const old = await make(agreements({ ana: { version: "2020-01", acceptedAt: at } })).execute(ana, "s1", "activate");
    expect(old.ok).toBe(false);

    const allowed = await make(agreements({ ana: { version: LIVE_GUIDELINES_VERSION, acceptedAt: at } })).execute(admin, "s1", "activate");
    expect(allowed.ok && allowed.value.control).toBe("on");
  });

  it("acceptedAt devolve a data do aceite vigente (portal)", async () => {
    expect(await new PrivacyGate(agreements({ ana: { version: LIVE_GUIDELINES_VERSION, acceptedAt: at } })).acceptedAt("ana")).toEqual(at);
    expect(await new PrivacyGate(agreements()).acceptedAt("ana")).toBeNull();
  });
});
