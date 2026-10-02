"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pollWhileVisible } from "../../stream-states/ui/poll-while-visible";
import { EMPTY_PULSE, PULSE_MS, type LivePulseView } from "../../live-presence/live-presence.use-case";
import { REACTION_KINDS, REACTION_LIMITS, type ReactionKind } from "../react-to-live.use-case";

export type FloatingReaction = { id: number; kind: ReactionKind; left: number };

const VIEWER_KEY = "lalaia:live:aba";
const MAX_FLOATS_PER_TICK = 12;

/** Id aleatório da aba (não é a conta): conta o espectador sem dizer quem é. */
function viewerId(): string {
  try {
    const saved = sessionStorage.getItem(VIEWER_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID().replaceAll("-", "");
    sessionStorage.setItem(VIEWER_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID().replaceAll("-", "");
  }
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (response.ok) return { ok: true, data: (await response.json()) as T };
  const parsed = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return { ok: false, status: response.status, message: parsed?.error?.message ?? "Não foi possível agora. Tente de novo." };
}

/**
 * Pulso da live (#189, #191): a cada poucos segundos a aba avisa que está assistindo e recebe espectadores,
 * curtidas e reações — iguais para todos. As reações dos outros viram emojis flutuando (a diferença entre um
 * pulso e o seguinte). Os toques da própria pessoa flutuam na hora e sobem agrupados num lote só.
 * `streamId` null = live fora do ar ou sem o recurso: nada é enviado.
 */
export function useLivePulse(streamId: string | null, loggedIn: boolean) {
  const [pulse, setPulse] = useState<LivePulseView>(EMPTY_PULSE);
  const [liked, setLiked] = useState(false);
  const [likedMessageIds, setLikedMessageIds] = useState<string[]>([]);
  const [floats, setFloats] = useState<FloatingReaction[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const known = useRef<LivePulseView["reactions"] | null>(null);
  const pending = useRef<Partial<Record<ReactionKind, number>>>({});
  const mine = useRef<Partial<Record<ReactionKind, number>>>({});
  const nextId = useRef(1);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const float = useCallback((kind: ReactionKind, amount: number) => {
    const created = Array.from({ length: Math.min(amount, MAX_FLOATS_PER_TICK) }, () => ({ id: nextId.current++, kind, left: 8 + Math.random() * 78 }));
    setFloats((current) => [...current, ...created].slice(-40));
    const ids = new Set(created.map((f) => f.id));
    setTimeout(() => setFloats((current) => current.filter((f) => !ids.has(f.id))), 2_600);
  }, []);

  const receive = useCallback(
    (next: LivePulseView) => {
      // Só o que os OUTROS mandaram desde o último pulso flutua agora (os meus já flutuaram no toque).
      if (known.current) {
        for (const kind of REACTION_KINDS) {
          const delta = next.reactions[kind] - known.current[kind] - (mine.current[kind] ?? 0);
          if (delta > 0) float(kind, delta);
        }
      }
      mine.current = {};
      known.current = next.reactions;
      setPulse(next);
    },
    [float],
  );

  useEffect(() => {
    if (!streamId) return;
    const id = viewerId();
    const beat = async (signal?: AbortSignal) => {
      const response = await fetch("/api/live/pulse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ streamId, viewerId: id }), signal });
      if (response.ok) receive((await response.json()) as LivePulseView);
    };
    const first = new AbortController();
    void beat(first.signal).catch(() => undefined);
    const stop = pollWhileVisible(beat, PULSE_MS);
    return () => {
      first.abort();
      stop();
      clearTimeout(flushTimer.current);
      known.current = null;
    };
  }, [streamId, receive]);

  // O que a pessoa já curtiu nesta live (a live e as mensagens): uma consulta ao entrar.
  useEffect(() => {
    if (!streamId || !loggedIn) return;
    const controller = new AbortController();
    fetch(`/api/live/chat/likes?${new URLSearchParams({ streamId })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const mineNow = (await response.json()) as { messageIds: string[]; likedLive: boolean };
        setLiked(mineNow.likedLive);
        setLikedMessageIds(mineNow.messageIds);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [streamId, loggedIn]);

  const flush = useCallback(async () => {
    flushTimer.current = undefined;
    const counts = pending.current;
    pending.current = {};
    if (!streamId || Object.keys(counts).length === 0) return;
    const result = await post<{ reactions: LivePulseView["reactions"] }>("/api/live/reactions", { streamId, counts }).catch(() => null);
    if (result?.ok) {
      for (const kind of REACTION_KINDS) mine.current[kind] = (mine.current[kind] ?? 0) + (counts[kind] ?? 0);
    } else if (result && result.status === 401) setNotice(result.message);
  }, [streamId]);

  const react = useCallback(
    (kind: ReactionKind) => {
      setNotice(null);
      float(kind, 1);
      pending.current[kind] = Math.min((pending.current[kind] ?? 0) + 1, REACTION_LIMITS.perKind);
      flushTimer.current ??= setTimeout(() => void flush(), REACTION_LIMITS.batchMs);
    },
    [float, flush],
  );

  const toggleLike = useCallback(async () => {
    if (!streamId) return;
    setNotice(null);
    const result = await post<{ liked: boolean; likes: number }>("/api/live/likes", { streamId }).catch(() => null);
    if (result?.ok) {
      setLiked(result.data.liked);
      setPulse((current) => ({ ...current, likes: result.data.likes }));
    } else setNotice(result?.message ?? "Sem conexão. Tente de novo.");
  }, [streamId]);

  return { pulse, liked, likedMessageIds, floats, notice, setNotice, react, toggleLike };
}
