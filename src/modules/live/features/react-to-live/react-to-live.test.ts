import { describe, expect, it, vi } from "vitest";
import type { ChatRoom } from "../../domain/chat";
import { ToggleMessageLike, likeMessageSchema } from "../like-chat-message/like-chat-message.use-case";
import { EMPTY_PULSE, LivePulse, pulseSchema } from "../live-presence/live-presence.use-case";
import { InMemoryRateLimiter, NO_REACTIONS, REACTION_KINDS, SendReactions, ToggleLiveLike, sendReactionsSchema } from "./react-to-live.use-case";

const STREAM = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const room = (patch: Partial<ChatRoom> = {}): ChatRoom => ({ streamId: STREAM, ownerId: "dona", status: "live", chatEnabled: true, slowSeconds: 0, ...patch });
const rooms = (r: ChatRoom | null = room()) => ({ room: vi.fn().mockResolvedValue(r) });
const yes = async () => true;
const no = async () => false;

describe("ToggleLiveLike (#189)", () => {
  it("alterna a curtida e devolve o total, igual para todos", async () => {
    const store = { toggleLike: vi.fn().mockResolvedValue({ liked: true }), likes: vi.fn().mockResolvedValue(12) };
    const result = await new ToggleLiveLike(rooms(), store, yes).execute({ id: "leo" }, STREAM);
    expect(result).toEqual({ ok: true, value: { liked: true, likes: 12 } });
    expect(store.toggleLike).toHaveBeenCalledWith("leo", STREAM);
  });

  it("vale mesmo com o chat desligado pelo anfitrião (só as reações ficam)", async () => {
    const store = { toggleLike: vi.fn().mockResolvedValue({ liked: true }), likes: vi.fn().mockResolvedValue(1) };
    expect((await new ToggleLiveLike(rooms(room({ chatEnabled: false })), store, yes).execute({ id: "leo" }, STREAM)).ok).toBe(true);
  });

  it("recusa com a live fora do ar, sem o recurso no plano ou quando o banco recusa", async () => {
    const store = { toggleLike: vi.fn().mockResolvedValue(null), likes: vi.fn() };
    const code = async (useCase: ToggleLiveLike) => {
      const r = await useCase.execute({ id: "leo" }, STREAM);
      return !r.ok && r.error.code;
    };
    expect(await code(new ToggleLiveLike(rooms(null), store, yes))).toBe("not_found");
    expect(await code(new ToggleLiveLike(rooms(room({ status: "paused" })), store, yes))).toBe("live_closed");
    expect(await code(new ToggleLiveLike(rooms(), store, no))).toBe("live_closed");
    expect(store.toggleLike).not.toHaveBeenCalled();
    expect(await code(new ToggleLiveLike(rooms(), store, yes))).toBe("live_closed");
  });
});

describe("SendReactions (#189)", () => {
  const deps = (allow = true) => {
    const addReactions = vi.fn().mockResolvedValue({ ...NO_REACTIONS, fire: 3 });
    const limiter = { allow: vi.fn().mockReturnValue(allow) };
    return { addReactions, limiter, useCase: new SendReactions(rooms(), { addReactions }, yes, limiter) };
  };

  it("soma o lote, limitando cada tipo e ignorando zeros", async () => {
    const { addReactions, limiter, useCase } = deps();
    const result = await useCase.execute({ id: "leo" }, STREAM, { fire: 3, heart: 500, clap: 0 });
    expect(result.ok && result.value.reactions.fire).toBe(3);
    expect(addReactions).toHaveBeenCalledWith(STREAM, { fire: 3, heart: 10 });
    expect(limiter.allow).toHaveBeenCalledWith(`reactions:${STREAM}:leo`, 1000);
  });

  it("lote vazio e lotes rápidos demais da mesma pessoa são recusados no servidor", async () => {
    const empty = deps();
    const r1 = await empty.useCase.execute({ id: "leo" }, STREAM, { fire: 0 });
    expect(!r1.ok && r1.error.code).toBe("no_reactions");
    expect(empty.limiter.allow).not.toHaveBeenCalled();

    const fast = deps(false);
    const r2 = await fast.useCase.execute({ id: "leo" }, STREAM, { fire: 1 });
    expect(!r2.ok && r2.error.code).toBe("rate_limited");
    expect(fast.addReactions).not.toHaveBeenCalled();
  });

  it("schema: só os tipos conhecidos, inteiros e não negativos", () => {
    expect(sendReactionsSchema.safeParse({ streamId: STREAM, counts: { fire: 2 } }).success).toBe(true);
    expect(sendReactionsSchema.safeParse({ streamId: STREAM, counts: { fire: -1 } }).success).toBe(false);
    expect(sendReactionsSchema.safeParse({ streamId: STREAM, counts: { fire: 1.5 } }).success).toBe(false);
    expect(sendReactionsSchema.parse({ streamId: STREAM, counts: { poop: 3, fire: 1 } }).counts).toEqual({ fire: 1 });
    expect(REACTION_KINDS).toEqual(["heart", "fire", "laugh", "clap", "cheers"]);
  });
});

describe("InMemoryRateLimiter", () => {
  it("libera a primeira ação e segura as seguintes até passar o intervalo, por chave", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter(() => now);
    expect(limiter.allow("leo", 1000)).toBe(true);
    expect(limiter.allow("leo", 1000)).toBe(false);
    expect(limiter.allow("bia", 1000)).toBe(true);
    now += 999;
    expect(limiter.allow("leo", 1000)).toBe(false);
    now += 1;
    expect(limiter.allow("leo", 1000)).toBe(true);
  });
});

describe("LivePulse (#191)", () => {
  const stores = () => ({
    presence: { beat: vi.fn().mockResolvedValue(7) },
    reactions: { likes: vi.fn().mockResolvedValue(12), reactionTotals: vi.fn().mockResolvedValue({ ...NO_REACTIONS, heart: 30 }) },
  });

  it("registra o batimento da aba e devolve os contadores do momento", async () => {
    const { presence, reactions } = stores();
    const result = await new LivePulse(rooms(), presence, reactions, yes).execute({ streamId: STREAM, viewerId: "aba-1234567890123456" });
    expect(result).toEqual({ ok: true, value: { viewers: 7, likes: 12, reactions: { ...NO_REACTIONS, heart: 30 } } });
    expect(presence.beat).toHaveBeenCalledWith(STREAM, "aba-1234567890123456", 15);
  });

  it("fora do ar, sem transmissão ou sem o recurso: nada é registrado e tudo vem zerado", async () => {
    for (const [r, entitled] of [
      [room({ status: "paused" }), yes],
      [null, yes],
      [room(), no],
    ] as const) {
      const { presence, reactions } = stores();
      expect(await new LivePulse(rooms(r), presence, reactions, entitled).execute({ streamId: STREAM, viewerId: "aba-1234567890123456" })).toEqual({ ok: true, value: EMPTY_PULSE });
      expect(presence.beat).not.toHaveBeenCalled();
    }
  });

  it("schema: o id da aba é um texto aleatório curto, nunca algo arbitrário", () => {
    expect(pulseSchema.safeParse({ streamId: STREAM, viewerId: "a".repeat(32) }).success).toBe(true);
    expect(pulseSchema.safeParse({ streamId: STREAM, viewerId: "curto" }).success).toBe(false);
    expect(pulseSchema.safeParse({ streamId: STREAM, viewerId: "<script>alert(1)</script>" }).success).toBe(false);
  });
});

describe("ToggleMessageLike (#190)", () => {
  it("alterna a curtida da mensagem; mensagem apagada ou de chat fechado → indisponível", async () => {
    const toggle = vi.fn().mockResolvedValueOnce({ liked: true, likes: 3 }).mockResolvedValueOnce(null);
    expect(await new ToggleMessageLike({ toggle }).execute({ id: "leo" }, "m1")).toEqual({ ok: true, value: { liked: true, likes: 3 } });
    const gone = await new ToggleMessageLike({ toggle }).execute({ id: "leo" }, "m1");
    expect(!gone.ok && gone.error.code).toBe("message_unavailable");
    expect(likeMessageSchema.safeParse({ messageId: "x" }).success).toBe(false);
  });
});
