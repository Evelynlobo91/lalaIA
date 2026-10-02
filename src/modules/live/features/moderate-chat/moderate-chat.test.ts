import { describe, expect, it, vi } from "vitest";
import { WordListFilter, type ChatMessage, type ChatRoom } from "../../domain/chat";
import { ChatPresenter, GetChatFeed } from "../chat-feed/chat-feed.use-case";
import { SendChatMessage } from "../send-chat-message/send-chat-message.use-case";
import { LiftChatRestriction, ListChatRestrictions, ModerateChatMessage, SaveChatSettings, chatSettingsSchema, moderateMessageSchema, type ChatModerationAction } from "./moderate-chat.use-case";

const STREAM = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const MESSAGE = "9c1e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b91";
const now = new Date("2026-10-02T23:30:00Z");
const room = (patch: Partial<ChatRoom> = {}): ChatRoom => ({ streamId: STREAM, ownerId: "dona", status: "live", chatEnabled: true, slowSeconds: 0, ...patch });
const message = (patch: Partial<ChatMessage & { deleted: boolean }> = {}) => ({ id: MESSAGE, seq: 1, streamId: STREAM, userId: "leo", body: "oi", isHost: false, replyTo: null, likes: 0, createdAt: now, deleted: false, ...patch });

const host = { id: "dona", canModerateAll: false };
const moderator = { id: "mod", canModerateAll: true };
const author = { id: "leo", canModerateAll: false };
const stranger = { id: "bia", canModerateAll: false };

describe("ModerateChatMessage (#192)", () => {
  const deps = (found: ReturnType<typeof message> | null = message(), r: ChatRoom | null = room()) => {
    const store = {
      find: vi.fn().mockResolvedValue(found),
      remove: vi.fn().mockResolvedValue(true),
      setPinned: vi.fn().mockResolvedValue(true),
      mute: vi.fn().mockResolvedValue(undefined),
      ban: vi.fn().mockResolvedValue(undefined),
    };
    return { store, useCase: new ModerateChatMessage({ room: vi.fn().mockResolvedValue(r) }, store, () => now) };
  };
  const run = async (actor: typeof host, action: ChatModerationAction, d = deps()) => ({ d, result: await d.useCase.execute(actor, MESSAGE, action) });

  it("apagar: anfitrião, moderação e o próprio autor podem; outra pessoa, não", async () => {
    for (const actor of [host, moderator, author]) {
      const { d, result } = await run(actor, "delete");
      expect(result.ok).toBe(true);
      expect(d.store.remove).toHaveBeenCalledWith(actor.id, MESSAGE);
    }
    const { d, result } = await run(stranger, "delete");
    expect(!result.ok && result.error.code).toBe("forbidden");
    expect(d.store.remove).not.toHaveBeenCalled();
  });

  it("apagar mensagem já apagada não faz nada (e não é erro)", async () => {
    const { d, result } = await run(host, "delete", deps(message({ deleted: true })));
    expect(result.ok).toBe(true);
    expect(d.store.remove).not.toHaveBeenCalled();
  });

  it("fixar e desafixar: só quem modera; o autor não fixa a própria", async () => {
    const pin = await run(host, "pin");
    expect(pin.d.store.setPinned).toHaveBeenCalledWith("dona", STREAM, MESSAGE, true);
    const unpin = await run(moderator, "unpin");
    expect(unpin.d.store.setPinned).toHaveBeenCalledWith("mod", STREAM, MESSAGE, false);
    const byAuthor = await run(author, "pin");
    expect(!byAuthor.result.ok && byAuthor.result.error.code).toBe("forbidden");
    const deleted = await run(host, "pin", deps(message({ deleted: true })));
    expect(!deleted.result.ok && deleted.result.error.code).toBe("not_found");
  });

  it("silenciar quem escreveu: 5 min, 1 h ou a live toda", async () => {
    const five = await run(host, "mute5");
    expect(five.d.store.mute).toHaveBeenCalledWith("dona", { ownerId: "dona", streamId: STREAM, userId: "leo", expiresAt: new Date("2026-10-02T23:35:00Z") });
    const hour = await run(host, "mute60");
    expect(hour.d.store.mute).toHaveBeenCalledWith("dona", expect.objectContaining({ expiresAt: new Date("2026-10-03T00:30:00Z") }));
    const whole = await run(moderator, "muteLive");
    expect(whole.d.store.mute).toHaveBeenCalledWith("mod", { ownerId: "dona", streamId: STREAM, userId: "leo", expiresAt: null });
  });

  it("banir: dos chats do parceiro dono da transmissão; nunca o próprio anfitrião nem conta removida", async () => {
    const ban = await run(host, "ban");
    expect(ban.d.store.ban).toHaveBeenCalledWith("dona", { ownerId: "dona", userId: "leo" });

    const self = await run(moderator, "ban", deps(message({ userId: "dona", isHost: true })));
    expect(!self.result.ok && self.result.error.code).toBe("cannot_restrict_host");
    const removed = await run(host, "mute5", deps(message({ userId: null })));
    expect(!removed.result.ok && removed.result.error.code).toBe("author_removed");
    const byStranger = await run(stranger, "ban");
    expect(!byStranger.result.ok && byStranger.result.error.code).toBe("forbidden");
    expect(byStranger.d.store.ban).not.toHaveBeenCalled();
  });

  it("mensagem ou transmissão inexistente → não encontrado; recusa do banco → proibido", async () => {
    const missing = await run(host, "delete", deps(null));
    expect(!missing.result.ok && missing.result.error.code).toBe("not_found");
    const refused = deps();
    refused.store.remove.mockResolvedValue(false);
    const r = await refused.useCase.execute(host, MESSAGE, "delete");
    expect(!r.ok && r.error.code).toBe("forbidden");
  });

  it("schemas: só as ações conhecidas e as opções de modo lento", () => {
    expect(moderateMessageSchema.safeParse({ messageId: MESSAGE, action: "mute60" }).success).toBe(true);
    expect(moderateMessageSchema.safeParse({ messageId: MESSAGE, action: "kick" }).success).toBe(false);
    expect(chatSettingsSchema.parse({ streamId: STREAM, chatEnabled: "off", slowSeconds: "30" })).toEqual({ streamId: STREAM, chatEnabled: false, slowSeconds: 30 });
    expect(chatSettingsSchema.safeParse({ streamId: STREAM, chatEnabled: "on", slowSeconds: "5" }).success).toBe(false);
  });
});

describe("SaveChatSettings / LiftChatRestriction / ListChatRestrictions", () => {
  it("só o dono da transmissão (ou a moderação) muda as opções do chat", async () => {
    const saveSettings = vi.fn().mockResolvedValue(true);
    const useCase = new SaveChatSettings({ room: vi.fn().mockResolvedValue(room()) }, { saveSettings });
    expect(await useCase.execute(host, STREAM, { chatEnabled: false, slowSeconds: 10 })).toEqual({ ok: true, value: { streamId: STREAM, chatEnabled: false, slowSeconds: 10 } });
    expect(saveSettings).toHaveBeenCalledWith("dona", STREAM, { chatEnabled: false, slowSeconds: 10 });
    const other = await useCase.execute(stranger, STREAM, { chatEnabled: false, slowSeconds: 0 });
    expect(!other.ok && other.error.code).toBe("forbidden");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("retira a restrição do próprio chat; lista com o nome de cada pessoa, sem o id", async () => {
    const lift = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await new LiftChatRestriction({ lift }).execute(host, "r1")).ok).toBe(true);
    const missing = await new LiftChatRestriction({ lift }).execute(host, "r1");
    expect(!missing.ok && missing.error.code).toBe("not_found");

    const listActive = vi.fn().mockResolvedValue([
      { id: "r1", userId: "leo", kind: "ban", streamId: null, expiresAt: null, createdAt: now },
      { id: "r2", userId: "sumiu", kind: "mute", streamId: STREAM, expiresAt: now, createdAt: now },
    ]);
    const views = await new ListChatRestrictions({ listActive }, async () => new Map([["leo", "Leo"]])).execute({ id: "dona" });
    expect(views.map((v) => [v.id, v.userName, v.kind])).toEqual([
      ["r1", "Leo", "ban"],
      ["r2", "Usuário removido", "mute"],
    ]);
    expect(views[0]).not.toHaveProperty("userId");
    expect(listActive).toHaveBeenCalledWith("dona", "dona");
  });
});

describe("enviar com moderação em vigor (#192)", () => {
  const sender = (opts: { blocked?: { kind: "mute" | "ban"; until: Date | null } | null; last?: Date | null; slowSeconds?: number } = {}) => {
    const insert = vi.fn(async (userId: string, m: { body: string; isHost: boolean; replyTo: string | null }) => ({ ...message(), userId, ...m }));
    const blocked = vi.fn().mockResolvedValue(opts.blocked ?? null);
    const useCase = new SendChatMessage(
      { room: vi.fn().mockResolvedValue(room({ slowSeconds: opts.slowSeconds ?? 0 })) },
      { insert, findVisible: vi.fn().mockResolvedValue(null) },
      new WordListFilter(),
      { lastMessageAt: vi.fn().mockResolvedValue(opts.last ?? null) },
      async () => true,
      { present: async (list) => list.map((m) => ({ id: m.id, seq: m.seq, body: m.body, author: { name: "x", avatarUrl: null, level: 1 }, isHost: m.isHost, replyTo: null, likes: 0, createdAt: "" })) },
      () => now,
      { blocked },
    );
    return { insert, blocked, useCase };
  };

  it("silenciado e banido não enviam, com a mensagem certa para cada caso", async () => {
    const text = async (b: { kind: "mute" | "ban"; until: Date | null }) => {
      const d = sender({ blocked: b });
      const r = await d.useCase.execute({ id: "leo" }, { streamId: STREAM, body: "oi" });
      expect(d.insert).not.toHaveBeenCalled();
      return !r.ok && r.error.code === "chat_blocked" ? r.error.message : null;
    };
    expect(await text({ kind: "ban", until: null })).toBe("Você não pode participar deste chat.");
    expect(await text({ kind: "mute", until: null })).toBe("Você foi silenciado neste chat até o fim da live.");
    expect(await text({ kind: "mute", until: new Date("2026-10-02T23:35:00Z") })).toBe("Você foi silenciado neste chat até 20:35.");
  });

  it("o anfitrião nunca é barrado no próprio chat (nem consulta as restrições)", async () => {
    const d = sender({ blocked: { kind: "ban", until: null } });
    expect((await d.useCase.execute({ id: "dona" }, { streamId: STREAM, body: "oi" })).ok).toBe(true);
    expect(d.blocked).not.toHaveBeenCalled();
  });

  it("modo lento vale para o público, no servidor; o anfitrião segue com o intervalo padrão", async () => {
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    const slow = sender({ slowSeconds: 30, last: tenSecondsAgo });
    const r = await slow.useCase.execute({ id: "leo" }, { streamId: STREAM, body: "de novo" });
    expect(!r.ok && r.error).toMatchObject({ code: "rate_limited", message: "Aguarde 20 s para enviar outra mensagem." });
    expect((await sender({ slowSeconds: 30, last: tenSecondsAgo }).useCase.execute({ id: "dona" }, { streamId: STREAM, body: "aviso" })).ok).toBe(true);
    expect((await sender({ slowSeconds: 10, last: tenSecondsAgo }).useCase.execute({ id: "leo" }, { streamId: STREAM, body: "agora sim" })).ok).toBe(true);
  });
});

describe("histórico com a mensagem fixada e o modo lento (#192)", () => {
  const authors = { describe: async (ids: string[]) => new Map(ids.map((id) => [id, { name: id === "dona" ? "Bar da Dona" : "Leo", avatarUrl: null, level: 1 }])) };
  const feed = (pinned: ChatMessage | null, latest: ChatMessage[], slowSeconds = 0) => {
    const reader = { version: async () => "9:0:0:3", latest: async () => latest, byIds: async () => [], pinned: async () => pinned };
    return new GetChatFeed({ room: async () => room({ slowSeconds }) }, reader, async () => true, new ChatPresenter(reader, authors));
  };
  const pinned = { ...message({ id: "fixada", seq: 3, userId: "dona", isHost: true, body: "Happy hour até 20h" }) } as ChatMessage;

  it("a fixada vem à parte, mesmo quando já saiu das últimas mensagens", async () => {
    const outside = await feed(pinned, [message({ id: "m9", seq: 9 })]).execute({ streamId: STREAM });
    expect(outside.ok && outside.value).toMatchObject({ messages: [{ id: "m9" }], pinned: { id: "fixada", body: "Happy hour até 20h", isHost: true }, version: "9:0:0:3:0" });
    const inside = await feed(pinned, [pinned, message({ id: "m9", seq: 9 })]).execute({ streamId: STREAM });
    expect(inside.ok && inside.value.messages).toHaveLength(2);
    expect(inside.ok && inside.value.pinned?.id).toBe("fixada");
    const none = await feed(null, [message()]).execute({ streamId: STREAM });
    expect(none.ok && none.value.pinned).toBeNull();
  });

  it("o modo lento vai para a tela e muda a versão (a tela percebe quando o anfitrião liga ou desliga)", async () => {
    const slow = await feed(null, [message()], 30).execute({ streamId: STREAM, version: "9:0:0:3:0" });
    expect(slow.ok && slow.value).toMatchObject({ version: "9:0:0:3:30", slowSeconds: 30, messages: [{ id: MESSAGE }] });
    const same = await feed(null, [message()], 30).execute({ streamId: STREAM, version: "9:0:0:3:30" });
    expect(same.ok && same.value).toEqual({ open: true, reason: null, version: "9:0:0:3:30", messages: null, slowSeconds: 30 });
  });
});
