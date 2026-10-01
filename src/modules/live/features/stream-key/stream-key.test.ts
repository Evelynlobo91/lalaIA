import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/kernel";
import type { LiveActor, NewStream, StreamRecord, StreamRepository, StreamTarget, StreamTargets } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { ListLiveTargets, ProvisionStream, RevealStreamKey, RotateStreamKey } from "./stream-key.use-case";
import { provisionStreamSchema } from "./stream-key.schema";

const PLACE = "11111111-1111-4111-8111-111111111111";
const ana: LiveActor = { id: "ana", isPartner: true, isAdmin: false };
const bia: LiveActor = { id: "bia", isPartner: true, isAdmin: false };
const admin: LiveActor = { id: "adm", isPartner: false, isAdmin: true };
const target: StreamTarget = { entityType: "place", entityId: PLACE };
/** Diretrizes de privacidade já aceitas (#55; a recusa é testada em privacy.test.ts). */
const accepted = { check: async () => ok(true as const) };

const record = (patch: Partial<StreamRecord> = {}): StreamRecord => ({
  id: "s1",
  ownerId: "ana",
  ...target,
  provider: "fake",
  providerStreamId: "fake-1",
  playbackId: "pb-1",
  control: "on",
  signal: "offline",
  status: "waiting",
  signalChangedAt: new Date(),
  createdAt: new Date(),
  note: null,
  ...patch,
});

function fakes(opts: { owned?: boolean; existing?: StreamRecord | null } = {}) {
  const keys = new Map<string, string>();
  let stored: StreamRecord | null = opts.existing ?? null;
  const streams: StreamRepository = {
    findById: vi.fn(async (id) => (stored?.id === id ? stored : null)),
    findByTarget: vi.fn(async () => stored),
    listByOwner: vi.fn(async (owner: string) => (stored && stored.ownerId === owner ? [stored] : [])),
    create: vi.fn(async (actorId: string, s: NewStream) => {
      stored = record({ ownerId: actorId, provider: s.provider, providerStreamId: s.providerStreamId, playbackId: s.playbackId });
      keys.set(stored.id, s.streamKey);
      return stored;
    }),
    saveKey: vi.fn(async (actorId, id, key) => {
      if (stored?.ownerId !== actorId) return false;
      keys.set(id, key);
      return true;
    }),
    keyFor: vi.fn(async (owner, id) => (stored?.ownerId === owner ? (keys.get(id) ?? null) : null)),
  };
  const targets: StreamTargets = {
    owns: vi.fn(async () => opts.owned ?? true),
    optionsFor: vi.fn(async () => [{ ...target, label: "Bar do Zé", href: `/lugares/${PLACE}` }]),
  };
  const provider: StreamingProvider = {
    name: "fake",
    ingestUrl: "rtmps://global-live.mux.com:443/app",
    createStream: vi.fn(async () => ({ providerStreamId: "fake-1", streamKey: "chave-secreta-1234567890", playbackId: "pb-1" })),
    resetStreamKey: vi.fn(async () => ({ streamKey: "chave-nova-1234567890abc" })),
    disable: vi.fn(),
    enable: vi.fn(),
    playbackUrl: (id) => `https://hls/${id}.m3u8`,
    verifyWebhook: vi.fn(),
  };
  return { streams, targets, provider, keys };
}

describe("ProvisionStream (#47)", () => {
  it("cria a transmissão no provedor e guarda a chave para o dono", async () => {
    const { streams, targets, provider, keys } = fakes();
    const result = await new ProvisionStream(streams, targets, () => provider, accepted).execute(ana, target);
    expect(result.ok && result.value.ownerId).toBe("ana");
    expect(provider.createStream).toHaveBeenCalledOnce();
    expect(keys.get("s1")).toBe("chave-secreta-1234567890");
  });

  it("é idempotente: o dono pedindo de novo recebe a mesma transmissão, sem criar outra", async () => {
    const { streams, targets, provider } = fakes({ existing: record() });
    const result = await new ProvisionStream(streams, targets, () => provider, accepted).execute(ana, target);
    expect(result.ok && result.value.id).toBe("s1");
    expect(provider.createStream).not.toHaveBeenCalled();
  });

  it("recusa lugar/evento que não é do parceiro", async () => {
    const { streams, targets, provider } = fakes({ owned: false });
    const result = await new ProvisionStream(streams, targets, () => provider, accepted).execute(bia, target);
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(provider.createStream).not.toHaveBeenCalled();
  });

  it("recusa quem não é parceiro (o papel é conferido de novo aqui)", async () => {
    const { streams, targets, provider } = fakes();
    const result = await new ProvisionStream(streams, targets, () => provider, accepted).execute(admin, target);
    expect(!result.ok && result.error.code).toBe("forbidden");
  });

  it("transmissão de outro responsável → conflito", async () => {
    const { streams, targets, provider } = fakes({ existing: record({ ownerId: "outro" }) });
    const result = await new ProvisionStream(streams, targets, () => provider, accepted).execute(ana, target);
    expect(!result.ok && result.error.code).toBe("conflict");
  });

  it("valida a entrada: tipo e id", () => {
    expect(provisionStreamSchema.safeParse({ entityType: "place", entityId: PLACE }).success).toBe(true);
    expect(provisionStreamSchema.safeParse({ entityType: "mission", entityId: PLACE }).success).toBe(false);
    expect(provisionStreamSchema.safeParse({ entityType: "event", entityId: "1 or 1=1" }).success).toBe(false);
  });
});

describe("RotateStreamKey e RevealStreamKey (#47)", () => {
  it("dono rotaciona: chave nova no provedor e no banco", async () => {
    const { streams, provider, keys } = fakes({ existing: record() });
    keys.set("s1", "chave-antiga-1234567890");
    const result = await new RotateStreamKey(streams, () => provider).execute(ana, "s1");
    expect(result.ok).toBe(true);
    expect(provider.resetStreamKey).toHaveBeenCalledWith("fake-1");
    expect(keys.get("s1")).toBe("chave-nova-1234567890abc");
  });

  it("outra pessoa (nem o admin) não rotaciona nem vê a chave", async () => {
    const { streams, provider, keys } = fakes({ existing: record() });
    keys.set("s1", "chave-antiga-1234567890");
    for (const actor of [bia, admin]) {
      const rotated = await new RotateStreamKey(streams, () => provider).execute(actor, "s1");
      expect(!rotated.ok && rotated.error.code).toBe("forbidden");
      const revealed = await new RevealStreamKey(streams).execute(actor, "s1");
      expect(!revealed.ok && revealed.error.code).toBe("not_found");
    }
    expect(provider.resetStreamKey).not.toHaveBeenCalled();
  });

  it("dono revela a própria chave", async () => {
    const { streams, keys } = fakes({ existing: record() });
    keys.set("s1", "chave-antiga-1234567890");
    const result = await new RevealStreamKey(streams).execute(ana, "s1");
    expect(result.ok && result.value.streamKey).toBe("chave-antiga-1234567890");
  });
});

describe("ListLiveTargets (#47)", () => {
  it("lista lugares/eventos do parceiro com a transmissão de cada um, sem a chave", async () => {
    const { streams, targets, provider } = fakes({ existing: record({ status: "live" }) });
    const view = await new ListLiveTargets(streams, targets, () => provider).execute(ana);
    expect(view).toEqual({
      ingestUrl: "rtmps://global-live.mux.com:443/app",
      simulated: true,
      targets: [{ ...target, label: "Bar do Zé", href: `/lugares/${PLACE}`, stream: { id: "s1", status: "live", note: null } }],
    });
    expect(JSON.stringify(view)).not.toContain("chave");
  });
});
