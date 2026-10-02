"use client";

import { ChevronDown, ChevronUp, CornerUpLeft, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar, Badge, Button } from "@/shared/ui";
import { CHAT_LIMITS, type ChatMessageView } from "../../../domain/chat";
import { pollWhileVisible } from "../../stream-states/ui/poll-while-visible";
import { CHAT_POLL_MS, type ChatFeedView } from "../chat-feed.use-case";

type Props = {
  streamId: string;
  /** Quem está logado (só o que a tela precisa); null = visitante, que lê e vê "Entre para participar". */
  viewer: { name: string } | null;
  /** Para onde o visitante vai para entrar e voltar a esta página. */
  loginHref: string;
};

const CLOSED_TEXT: Record<string, string> = {
  not_live: "O chat fecha quando a live não está no ar.",
  disabled: "O anfitrião desligou o chat desta live.",
};

/**
 * #188 — Chat da live: histórico (últimas 50), atualização sozinha e envio. Fica logo abaixo do player e pode
 * ser recolhido. Na POC a atualização é um polling curto, só com a aba visível (como o status da live);
 * este componente é a fachada para trocar por Supabase Realtime depois.
 */
export function LiveChat({ streamId, viewer, loginHref }: Props) {
  const [feed, setFeed] = useState<{ open: boolean; reason: string | null; messages: ChatMessageView[] } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const version = useRef<string | undefined>(undefined);
  const list = useRef<HTMLOListElement>(null);
  const stick = useRef(true);

  const apply = useCallback((next: ChatFeedView) => {
    version.current = next.version;
    setFeed((current) => ({ open: next.open, reason: next.reason, messages: next.messages ?? current?.messages ?? [] }));
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
              {feed.messages.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-sm">
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
                  {viewer && (
                    <button type="button" onClick={() => setReplyTo(m)} aria-label={`Responder a ${m.author.name}`} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg">
                      <CornerUpLeft aria-hidden className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ol>

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
