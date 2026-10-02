"use client";

import { ChevronDown, ChevronUp, CornerUpLeft, Heart, MessageCircle, MoreVertical, Pin, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar, Badge, Button, cn } from "@/shared/ui";
import { CHAT_LIMITS, type ChatMessageView } from "../../../domain/chat";
import type { ChatModerationAction } from "../../moderate-chat/moderate-chat.use-case";
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "../../report-chat-message/report-chat-message.use-case";
import { pollWhileVisible } from "../../stream-states/ui/poll-while-visible";
import { CHAT_POLL_MS, type ChatFeedView } from "../chat-feed.use-case";

type Props = {
  streamId: string;
  /**
   * Quem está logado (só o que a tela precisa); null = visitante, que lê e vê "Entre para participar".
   * `canModerate`: anfitrião ou moderação da plataforma (o servidor confere de novo a cada ação).
   */
  viewer: { name: string; canModerate: boolean } | null;
  /** Para onde o visitante vai para entrar e voltar a esta página. */
  loginHref: string;
  /** Mensagens que a pessoa logada já tinha curtido (#190), vindas do servidor ao entrar. */
  likedMessageIds?: string[];
  /** Mensagens que a pessoa logada escreveu (pode apagar as próprias, #192). */
  ownMessageIds?: string[];
};

const CLOSED_TEXT: Record<string, string> = {
  not_live: "O chat fecha quando a live não está no ar.",
  disabled: "O anfitrião desligou o chat desta live.",
};

const MODERATION: Array<{ action: ChatModerationAction; label: string }> = [
  { action: "pin", label: "Fixar no topo" },
  { action: "mute5", label: "Silenciar por 5 min" },
  { action: "mute60", label: "Silenciar por 1 h" },
  { action: "muteLive", label: "Silenciar a live toda" },
  { action: "ban", label: "Banir do chat" },
];

type Feed = { open: boolean; reason: string | null; messages: ChatMessageView[]; pinned: ChatMessageView | null; slowSeconds: number };

/**
 * #188 — Chat da live: histórico (últimas 50), atualização sozinha e envio. Fica logo abaixo do player e pode
 * ser recolhido. Na POC a atualização é um polling curto, só com a aba visível (como o status da live);
 * este componente é a fachada para trocar por Supabase Realtime depois.
 */
export function LiveChat({ streamId, viewer, loginHref, likedMessageIds, ownMessageIds }: Props) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  // Curtidas da própria pessoa: o que veio do servidor, mais o que ela mudou nesta tela.
  const [likeChanges, setLikeChanges] = useState<Record<string, boolean>>({});
  const isLiked = (id: string) => likeChanges[id] ?? likedMessageIds?.includes(id) ?? false;
  // Mensagens da própria pessoa: as que vieram do servidor ao entrar, mais as enviadas nesta tela.
  const [sentIds, setSentIds] = useState<string[]>([]);
  const isMine = (id: string) => sentIds.includes(id) || (ownMessageIds?.includes(id) ?? false);
  const version = useRef<string | undefined>(undefined);
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  const apply = useCallback((next: ChatFeedView) => {
    version.current = next.version;
    setFeed((current) => ({
      open: next.open,
      reason: next.reason,
      messages: next.messages ?? current?.messages ?? [],
      // Sem mudança (messages null), a fixada continua a mesma.
      pinned: next.messages ? (next.pinned ?? null) : (current?.pinned ?? null),
      slowSeconds: next.slowSeconds,
    }));
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const query = new URLSearchParams({ streamId, ...(version.current ? { version: version.current } : {}) });
      const response = await fetch(`/api/live/chat?${query}`, { cache: "no-store", signal });
      if (response.ok) apply((await response.json()) as ChatFeedView);
    },
    [streamId, apply],
  );

  useEffect(() => {
    const first = new AbortController();
    void refresh(first.signal).catch(() => undefined);
    const stop = pollWhileVisible(refresh, CHAT_POLL_MS);
    return () => {
      first.abort();
      stop();
    };
  }, [refresh]);

  // Acompanha as mensagens novas, a não ser que a pessoa tenha rolado para ler as antigas.
  const count = feed?.messages.length ?? 0;
  const lastId = feed?.messages[count - 1]?.id;
  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lastId, expanded]);

  const toggleLike = async (message: ChatMessageView) => {
    const response = await fetch("/api/live/chat/likes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: message.id }) }).catch(() => null);
    if (!response?.ok) return;
    const result = (await response.json()) as { liked: boolean; likes: number };
    setLikeChanges((current) => ({ ...current, [message.id]: result.liked }));
    setFeed((current) => current && { ...current, messages: current.messages.map((m) => (m.id === message.id ? { ...m, likes: result.likes } : m)) });
  };

  const moderate = async (message: ChatMessageView, action: ChatModerationAction, done: string) => {
    setMenuFor(null);
    setNotice(null);
    const response = await fetch("/api/live/chat/moderation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: message.id, action }) }).catch(() => null);
    if (response?.ok) {
      setNotice(done);
      await refresh().catch(() => undefined);
    } else {
      const body = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setNotice(body?.error?.message ?? "Não foi possível agora. Tente de novo.");
    }
  };

  const report = async (message: ChatMessageView, reason: ReportReason) => {
    setMenuFor(null);
    setReporting(null);
    const response = await fetch("/api/live/chat/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: message.id, reason }) }).catch(() => null);
    if (response?.ok) setNotice("Denúncia enviada. A moderação vai analisar.");
    else {
      const body = (await response?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setNotice(body?.error?.message ?? "Não foi possível denunciar agora. Tente de novo.");
    }
  };

  if (!feed || feed.reason === "unavailable") return null;

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/live/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streamId, body: text, replyTo: replyTo?.id ?? null }),
      });
      if (response.ok) {
        const sent = (await response.json()) as ChatMessageView;
        setSentIds((ids) => [...ids, sent.id]);
        setText("");
        setReplyTo(null);
        stick.current = true;
        await refresh().catch(() => undefined);
      } else {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string; details?: Array<{ message?: string }> } } | null;
        setError(body?.error?.details?.[0]?.message ?? body?.error?.message ?? "Não foi possível enviar. Tente de novo.");
      }
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setSending(false);
    }
  };

  const menuButton = "min-h-9 rounded-lg px-2 text-left text-sm hover:bg-surface-2";

  return (
    <section aria-label="Chat da live" className="flex flex-col rounded-2xl border border-border bg-surface">
      <h3 className="m-0">
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls="chat-da-live" className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
          <MessageCircle aria-hidden className="size-4" />
          Chat
          {count > 0 && <span className="font-normal text-muted">({count})</span>}
          {expanded ? <ChevronUp aria-hidden className="ml-auto size-4" /> : <ChevronDown aria-hidden className="ml-auto size-4" />}
        </button>
      </h3>

      <div id="chat-da-live" hidden={!expanded} className="flex flex-col gap-2 border-t border-border p-3">
        {!feed.open ? (
          <p role="status" className="text-sm text-muted">
            {CLOSED_TEXT[feed.reason ?? ""] ?? "Chat fechado."}
          </p>
        ) : (
          <>
            {feed.pinned && (
              <div aria-label="Mensagem fixada" role="note" className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <Pin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="font-semibold">{feed.pinned.author.name}:</span> {feed.pinned.body}
                </p>
                {viewer?.canModerate && (
                  <button type="button" onClick={() => void moderate(feed.pinned!, "unpin", "Mensagem desafixada.")} aria-label="Desafixar a mensagem" className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg">
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            )}

            <ol
              ref={list}
              role="log"
              aria-live="polite"
              aria-label="Mensagens do chat"
              tabIndex={0}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
              className="flex max-h-72 min-h-16 flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
            >
              {count === 0 && <li className="text-sm text-muted">Ninguém escreveu ainda. Comece a conversa.</li>}
              {feed.messages.map((m) => {
                const mine = isMine(m.id);
                const canDelete = viewer !== null && (viewer.canModerate || mine);
                return (
                  <li key={m.id} className="flex flex-col gap-1 text-sm">
                    <div className="flex items-start gap-2">
                      <Avatar name={m.author.name} src={m.author.avatarUrl} size="sm" className="size-7 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="font-semibold">{m.author.name}</span>
                          {m.isHost ? <Badge variant="success">Anfitrião</Badge> : m.author.level !== null && <span className="text-xs text-muted">Nível {m.author.level}</span>}
                        </p>
                        {m.replyTo && (
                          <p className="mt-0.5 truncate border-l-2 border-border pl-2 text-xs text-muted">
                            {m.replyTo.authorName}: {m.replyTo.excerpt}
                          </p>
                        )}
                        <p className="[overflow-wrap:anywhere]">{m.body}</p>
                      </div>
                      {viewer ? (
                        <button
                          type="button"
                          onClick={() => void toggleLike(m)}
                          aria-pressed={isLiked(m.id)}
                          aria-label={`${isLiked(m.id) ? "Descurtir" : "Curtir"} a mensagem de ${m.author.name}`}
                          className={cn("flex h-9 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs", isLiked(m.id) ? "text-danger" : "text-muted hover:text-fg")}
                        >
                          <Heart aria-hidden className={cn("size-4", isLiked(m.id) && "fill-current")} />
                          {m.likes > 0 && <span>{m.likes}</span>}
                        </button>
                      ) : (
                        m.likes > 0 && (
                          <span className="flex h-9 shrink-0 items-center gap-1 px-1.5 text-xs text-muted" aria-label={`${m.likes} curtidas`}>
                            <Heart aria-hidden className="size-4" /> {m.likes}
                          </span>
                        )
                      )}
                      {viewer && (
                        <button type="button" onClick={() => setReplyTo(m)} aria-label={`Responder a ${m.author.name}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg">
                          <CornerUpLeft aria-hidden className="size-4" />
                        </button>
                      )}
                      {viewer && (
                        <button
                          type="button"
                          onClick={() => setMenuFor((current) => (current === m.id ? null : m.id))}
                          aria-expanded={menuFor === m.id}
                          aria-label={`Opções da mensagem de ${m.author.name}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
                        >
                          <MoreVertical aria-hidden className="size-4" />
                        </button>
                      )}
                    </div>
                    {viewer && menuFor === m.id && (
                      <div role="group" aria-label={`Opções para a mensagem de ${m.author.name}`} className="ml-9 flex flex-col rounded-xl border border-border bg-surface p-1">
                        {canDelete && (
                          <button type="button" className={cn(menuButton, "text-danger")} onClick={() => void moderate(m, "delete", "Mensagem apagada.")}>
                            Apagar mensagem
                          </button>
                        )}
                        {!mine &&
                          (reporting === m.id ? (
                            <div role="group" aria-label="Motivo da denúncia" className="flex flex-col border-t border-border pt-1">
                              {REPORT_REASONS.map((reason) => (
                                <button key={reason} type="button" className={menuButton} onClick={() => void report(m, reason)}>
                                  {REPORT_REASON_LABELS[reason]}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button type="button" className={menuButton} onClick={() => setReporting(m.id)}>
                              Denunciar
                            </button>
                          ))}
                        {viewer?.canModerate &&
                          MODERATION.filter(({ action }) => action === "pin" || (!m.isHost && !mine)).map(({ action, label }) => (
                            <button
                              key={action}
                              type="button"
                              className={menuButton}
                              onClick={() => void moderate(m, action, action === "pin" ? "Mensagem fixada." : action === "ban" ? `${m.author.name} foi banido do chat.` : `${m.author.name} foi silenciado.`)}
                            >
                              {label}
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {notice && (
              <p role="status" className="text-sm text-muted">
                {notice}
              </p>
            )}

            {viewer ? (
              <form onSubmit={send} className="flex flex-col gap-2" aria-label="Enviar mensagem no chat">
                {replyTo && (
                  <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-xs text-muted">
                    <span className="min-w-0 flex-1 truncate">
                      Respondendo a {replyTo.author.name}: {replyTo.body}
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar a resposta" className="flex size-7 shrink-0 items-center justify-center rounded-full hover:text-fg">
                      <X aria-hidden className="size-4" />
                    </button>
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <label htmlFor="chat-mensagem" className="sr-only">
                    Mensagem
                  </label>
                  <input
                    id="chat-mensagem"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={CHAT_LIMITS.body}
                    autoComplete="off"
                    placeholder="Escreva uma mensagem"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base"
                  />
                  <Button type="submit" size="sm" loading={sending} disabled={!text.trim()} aria-label="Enviar mensagem" className="h-11">
                    <Send aria-hidden className="size-4" />
                  </Button>
                </div>
                {feed.slowSeconds > 0 && !viewer.canModerate && <p className="text-xs text-muted">Modo lento: 1 mensagem a cada {feed.slowSeconds} s.</p>}
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm">
                <Link href={loginHref} className="font-medium text-brand underline">
                  Entre para participar
                </Link>{" "}
                <span className="text-muted">do chat.</span>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
