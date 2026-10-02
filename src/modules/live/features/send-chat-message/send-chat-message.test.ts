import { describe, expect, it, vi } from "vitest";
import { WordListFilter, blockedWordsFrom, containsLink, excerptOf, normalizeForFilter, tidyMessage, type ChatMessage, type ChatRoom } from "../../domain/chat";
import { ChatPresenter, GetChatFeed } from "../chat-feed/chat-feed.use-case";
import { SendChatMessage, sendChatMessageSchema } from "./send-chat-message.use-case";

const STREAM = "3b0e7c56-4a1f-4c8e-9d2a-7a1c5e6f8b90";
const now = new Date("2026-10-02T23:30:00Z");
const room = (patch: Partial<ChatRoom> = {}): ChatRoom => ({ streamId: STREAM, ownerId: "dona", status: "live", chatEnabled: true, ...patch });
const message = (patch: Partial<ChatMessage> = {}): ChatMessage => ({ id: "m1", seq: 1, streamId: STREAM, userId: "leo", body: "Que som bom!", isHost: false, replyTo: null, createdAt: now, ...patch });

describe("texto da mensagem", () => {
  it("uma mensagem é uma linha: junta espaços e quebras", () => {
    expect(tidyMessage("  oi \n\n  gente  ")).toBe("oi gente");
    expect(tidyMessage(" \n ")).toBe("");
  });

  it("reconhece links com http, www e domínios soltos; não confunde frases comuns", () => {
    for (const text of ["veja https://x.io/a", "entra em www.site.com", "meu insta: bar.com.br/promo", "bit.ly/abc", "SITE.COM"]) expect(containsLink(text)).toBe(true);
    for (const text of ["cheguei às 22.30", "casa cheia... vem", "R$ 10,50 o chope", "fim.Começo de outra frase"]) expect(containsLink(text)).toBe(false);
  });

  it("trecho citado na resposta é cortado com reticências", () => {
    expect(excerptOf("curto")).toBe("curto");
    expect(excerptOf("a".repeat(80))).toHaveLength(60);
    expect(excerptOf("a".repeat(80)).endsWith("…")).toBe(true);
  });
});

describe("WordListFilter (filtro de conteúdo)", () => {
  const filter = new WordListFilter();

  it("bloqueia palavrão, com acento, maiúsculas, letras repetidas e 'leet'", () => {
    for (const text of ["que MERDA de som", "pooorra", "seu otário", "v1ad0", "vai tomar no cu!", "filho  da puta", "c4r4lh0"]) expect(filter.allows(text)).toBe(false);
  });

  it("não bloqueia palavra que só contém o termo, nem conversa normal", () => {
    for (const text of ["que show!", "computador novo", "disputa boa", "o deputado chegou", "reputação da casa", "Chope em dobro até 21h"]) expect(filter.allows(text)).toBe(true);
  });

  it("aceita termos extras do ambiente e normaliza como a mensagem", () => {
    const custom = new WordListFilter(blockedWordsFrom(" Concorrente , x ,palavra feia"));
    expect(custom.allows("vá no concorrente")).toBe(false);
    expect(custom.allows("que palavra  feia")).toBe(false);
    expect(custom.allows("x")).toBe(true);
    expect(normalizeForFilter("V1ÁD0OO")).toBe("viado");
  });
});

describe("SendChatMessage (#187)", () => {
  const deps = (opts: { room?: ChatRoom | null; last?: Date | null; entitled?: boolean; inserted?: ChatMessage | null; quoted?: ChatMessage | null } = {}) => {
    const insert = vi.fn(async (userId: string, m: { body: string; isHost: boolean; replyTo: string | null }) => (opts.inserted === undefined ? message({ userId, ...m }) : opts.inserted));
    const findVisible = vi.fn().mockResolvedValue(opts.quoted ?? null);
    const present = vi.fn(async (list: ChatMessage[]) => list.map((m) => ({ id: m.id, seq: m.seq, body: m.body, author: { name: "Leo", avatarUrl: null, level: 2 }, isHost: m.isHost, replyTo: null, createdAt: m.createdAt.toISOString() })));
    const useCase = new SendChatMessage(
      { room: vi.fn().mockResolvedValue(opts.room === undefined ? room() : opts.room) },
      { insert, findVisible },
      new WordListFilter(),
      { lastMessageAt: vi.fn().mockResolvedValue(opts.last ?? null) },
      vi.fn().mockResolvedValue(opts.entitled ?? true),
      { present },
      () => now,
    );
    return { insert, findVisible, useCase };
  };
  const send = (d: ReturnType<typeof deps>, body: string, sender = "leo", replyTo?: string) => d.useCase.execute({ id: sender }, { streamId: STREAM, body, replyTo });
  const code = async (d: ReturnType<typeof deps>, body = "oi", sender = "leo") => {
    const r = await send(d, body, sender);
    expect(d.insert).not.toHaveBeenCalled();
    return !r.ok && r.error.code;
  };

  it("grava a mensagem limpa em nome de quem está logado e devolve pronta para a tela", async () => {
    const d = deps();
    const result = await send(d, "  Que som   bom! ");
    expect(result.ok && result.value).toMatchObject({ body: "Que som bom!", isHost: false, author: { name: "Leo", level: 2 } });
    expect(d.insert).toHaveBeenCalledWith("leo", { streamId: STREAM, body: "Que som bom!", isHost: false, replyTo: null });
  });

  it("mensagem do dono da transmissão leva o selo de anfitrião e pode ter link", async () => {
    const d = deps();
    expect((await send(d, "Cardápio em https://bar.com/menu", "dona")).ok).toBe(true);
    expect(d.insert).toHaveBeenCalledWith("dona", expect.objectContaining({ isHost: true }));
  });

  it("chat fechado: live fora do ar, chat desligado ou plano sem chat", async () => {
    expect(await code(deps({ room: null }))).toBe("not_found");
    for (const status of ["waiting", "paused", "ended"] as const) expect(await code(deps({ room: room({ status }) }))).toBe("chat_closed");
    expect(await code(deps({ room: room({ chatEnabled: false }) }))).toBe("chat_closed");
    expect(await code(deps({ entitled: false }))).toBe("chat_closed");
  });

  it("recusa mensagem vazia, longa demais, com link (de quem não é anfitrião) e ofensiva", async () => {
    expect(await code(deps(), "   ")).toBe("validation_failed");
    expect(await code(deps(), "a".repeat(201))).toBe("validation_failed");
    expect(await code(deps(), "entra em www.golpe.com")).toBe("link_blocked");
    expect(await code(deps(), "que merda")).toBe("content_blocked");
    expect(await code(deps(), "que merda", "dona")).toBe("content_blocked");
    expect((await send(deps(), "a".repeat(200))).ok).toBe(true);
  });

  it("rate limit no servidor: uma mensagem a cada 3 s por pessoa", async () => {
    const tooSoon = deps({ last: new Date(now.getTime() - 1_200) });
    const result = await send(tooSoon, "de novo");
    expect(!result.ok && result.error).toMatchObject({ code: "rate_limited", message: "Aguarde 2 s para enviar outra mensagem." });
    expect(tooSoon.insert).not.toHaveBeenCalled();
    expect((await send(deps({ last: new Date(now.getTime() - 3_000) }), "agora sim")).ok).toBe(true);
  });

  it("resposta: cita mensagem visível da mesma live; se ela sumiu, envia sem a citação", async () => {
    const quoted = deps({ quoted: message({ id: "m0" }) });
    await send(quoted, "concordo", "leo", "m0");
    expect(quoted.findVisible).toHaveBeenCalledWith(STREAM, "m0");
    expect(quoted.insert).toHaveBeenCalledWith("leo", expect.objectContaining({ replyTo: "m0" }));

    const gone = deps();
    await send(gone, "concordo", "leo", "m0");
    expect(gone.insert).toHaveBeenCalledWith("leo", expect.objectContaining({ replyTo: null }));
  });

  it("se o banco recusar (o chat fechou no meio), responde chat fechado", async () => {
    const result = await send(deps({ inserted: null }), "oi");
    expect(!result.ok && result.error.code).toBe("chat_closed");
  });

  it("schema: corpo grande demais nem chega ao caso de uso", () => {
    expect(sendChatMessageSchema.safeParse({ streamId: STREAM, body: "oi" }).success).toBe(true);
    expect(sendChatMessageSchema.safeParse({ streamId: STREAM, body: "a".repeat(1001) }).success).toBe(false);
    expect(sendChatMessageSchema.safeParse({ streamId: "x", body: "oi" }).success).toBe(false);
  });
});

describe("ChatPresenter / GetChatFeed (#188)", () => {
  const authors = { describe: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => id !== "sumiu").map((id) => [id, { name: id === "dona" ? "Bar da Dona" : "Leo", avatarUrl: null, level: id === "dona" ? 5 : 2 }]))) };

  it("monta autor, selo e citação; conta excluída vira 'Usuário removido'", async () => {
    const byIds = vi.fn().mockResolvedValue([message({ id: "antiga", userId: null, body: "primeira mensagem da noite" })]);
    const views = await new ChatPresenter({ byIds }, authors).present([
      message({ id: "m1", userId: "leo" }),
      message({ id: "m2", seq: 2, userId: "dona", isHost: true, body: "Bem-vindos!", replyTo: "m1" }),
      message({ id: "m3", seq: 3, userId: "sumiu", replyTo: "antiga" }),
    ]);
    expect(views[0]).toMatchObject({ author: { name: "Leo", level: 2 }, isHost: false, replyTo: null, createdAt: now.toISOString() });
    expect(views[1]).toMatchObject({ author: { name: "Bar da Dona" }, isHost: true, replyTo: { id: "m1", authorName: "Leo", excerpt: "Que som bom!" } });
    expect(views[2]).toMatchObject({ author: { name: "Usuário removido", level: null }, replyTo: { id: "antiga", authorName: "Usuário removido" } });
    expect(byIds).toHaveBeenCalledWith(["antiga"]);
    expect(JSON.stringify(views)).not.toContain('"userId"');
  });

  const feedDeps = (opts: { room?: ChatRoom | null; entitled?: boolean; version?: string } = {}) => {
    const latest = vi.fn().mockResolvedValue([message()]);
    const reader = { version: vi.fn().mockResolvedValue(opts.version ?? "7:0"), latest, byIds: vi.fn().mockResolvedValue([]) };
    const useCase = new GetChatFeed({ room: vi.fn().mockResolvedValue(opts.room === undefined ? room() : opts.room) }, reader, vi.fn().mockResolvedValue(opts.entitled ?? true), new ChatPresenter(reader, authors));
    return { latest, useCase };
  };

  it("quem entra recebe as últimas 50 mensagens e a versão", async () => {
    const { latest, useCase } = feedDeps();
    const result = await useCase.execute({ streamId: STREAM });
    expect(result.ok && result.value).toMatchObject({ open: true, reason: null, version: "7:0", messages: [{ id: "m1", body: "Que som bom!" }] });
    expect(latest).toHaveBeenCalledWith(STREAM, 50);
  });

  it("nada mudou desde a versão da tela: responde sem as mensagens (e sem buscá-las)", async () => {
    const { latest, useCase } = feedDeps();
    const result = await useCase.execute({ streamId: STREAM, version: "7:0" });
    expect(result.ok && result.value).toEqual({ open: true, reason: null, version: "7:0", messages: null });
    expect(latest).not.toHaveBeenCalled();
  });

  it("fechado: live fora do ar, chat desligado ou plano sem chat (sem histórico); transmissão inexistente → 404", async () => {
    const closed = async (opts: Parameters<typeof feedDeps>[0]) => {
      const d = feedDeps(opts);
      const r = await d.useCase.execute({ streamId: STREAM });
      expect(d.latest).not.toHaveBeenCalled();
      return r.ok ? r.value : null;
    };
    expect(await closed({ room: room({ status: "paused" }) })).toMatchObject({ open: false, reason: "not_live", messages: [] });
    expect(await closed({ room: room({ chatEnabled: false }) })).toMatchObject({ open: false, reason: "disabled" });
    expect(await closed({ entitled: false })).toMatchObject({ open: false, reason: "unavailable" });
    const missing = await feedDeps({ room: null }).useCase.execute({ streamId: STREAM });
    expect(!missing.ok && missing.error.code).toBe("not_found");
  });
});
