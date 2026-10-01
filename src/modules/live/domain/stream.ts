// Transmissão ao vivo de um lugar ou evento. A plataforma não faz streaming: guarda o vínculo com o
// provedor (Mux), o controle do parceiro e o sinal informado pelos webhooks.

export const STREAM_ENTITY_TYPES = ["place", "event"] as const;
export type StreamEntityType = (typeof STREAM_ENTITY_TYPES)[number];

/** Controle do parceiro: no ar (quando houver sinal), pausada (player oculto) ou encerrada (chave desativada). */
export type StreamControl = "on" | "paused" | "ended";
/** Sinal do provedor: recebendo vídeo ou não. */
export type StreamSignal = "offline" | "live";
/** O que o público vê. Derivado de controle + sinal (o banco calcula a mesma regra numa coluna gerada). */
export type StreamStatus = "waiting" | "live" | "paused" | "ended";

export function statusOf(control: StreamControl, signal: StreamSignal): StreamStatus {
  if (control === "ended") return "ended";
  if (control === "paused") return "paused";
  return signal === "live" ? "live" : "waiting";
}

export const STATUS_LABELS: Record<StreamStatus, string> = {
  waiting: "Aguardando sinal",
  live: "Ao vivo",
  paused: "Pausada",
  ended: "Encerrada",
};

export type SignalState = { signal: StreamSignal; signalChangedAt: Date };

/**
 * Sinal depois de um evento do provedor. `active` = recebendo vídeo; `idle`/`disconnected`/`disabled` =
 * sem vídeo; `connected`/`enabled` não mudam o que o público vê. Webhooks podem chegar fora de ordem:
 * evento mais antigo que a última mudança de sinal é registrado no log, mas não muda o status.
 * O controle do parceiro (pausar/encerrar) nunca muda por webhook.
 */
export function signalAfter(current: SignalState, event: { kind: string; occurredAt: Date }): SignalState {
  const next: StreamSignal | null =
    event.kind === "active" ? "live" : event.kind === "idle" || event.kind === "disconnected" || event.kind === "disabled" ? "offline" : null;
  if (!next || event.occurredAt < current.signalChangedAt) return current;
  if (next === current.signal) return current;
  return { signal: next, signalChangedAt: event.occurredAt };
}

export type StreamTarget = { entityType: StreamEntityType; entityId: string };

export type StreamRecord = StreamTarget & {
  id: string;
  ownerId: string;
  provider: string;
  providerStreamId: string;
  playbackId: string;
  control: StreamControl;
  signal: StreamSignal;
  status: StreamStatus;
  signalChangedAt: Date;
  createdAt: Date;
  /** Situação atual definida pelo parceiro (#53), ex.: "Casa cheia". */
  note: string | null;
};

export type NewStream = StreamTarget & { provider: string; providerStreamId: string; playbackId: string; streamKey: string };

/** Quem age: o id vem SEMPRE da sessão; papéis conferidos de novo no caso de uso. */
export type LiveActor = { id: string; isPartner: boolean; isAdmin: boolean };

/** Persistência das transmissões. Escritas do parceiro rodam como o usuário (asUser + RLS). */
export interface StreamRepository {
  findById(id: string): Promise<StreamRecord | null>;
  findByTarget(target: StreamTarget): Promise<StreamRecord | null>;
  listByOwner(ownerId: string): Promise<StreamRecord[]>;
  /** Cria a transmissão e guarda a chave (só o dono lê). Devolve null se o lugar/evento já tiver uma. */
  create(actorId: string, stream: NewStream): Promise<StreamRecord | null>;
  /** Troca a chave (só o dono). */
  saveKey(actorId: string, streamId: string, streamKey: string): Promise<boolean>;
  /** A chave da transmissão, só para o dono (RLS); null para qualquer outra pessoa. */
  keyFor(ownerId: string, streamId: string): Promise<string | null>;
}

/** Ações do parceiro no portal (#49). */
export const STREAM_ACTIONS = ["activate", "pause", "end"] as const;
export type StreamAction = (typeof STREAM_ACTIONS)[number];

export const CONTROL_BY_ACTION: Record<StreamAction, { control: StreamControl; kind: "activated" | "paused" | "ended" }> = {
  activate: { control: "on", kind: "activated" },
  pause: { control: "paused", kind: "paused" },
  end: { control: "ended", kind: "ended" },
};

/** Situação atual (#53): texto curto que o parceiro edita. */
export const STREAM_NOTE_MAX = 80;

/** Grava a situação atual como o usuário (RLS: dono ou admin). null se o banco não permitir. */
export interface StreamNoteStore {
  setNote(actorId: string, streamId: string, note: string | null): Promise<StreamRecord | null>;
}

/** Muda o controle e registra a ação no log de ciclo de vida, na mesma transação. */
export interface StreamControlStore {
  /** Como o usuário (RLS: dono ou admin). null se o banco não permitir. */
  setControl(actorId: string, streamId: string, change: { control: StreamControl; kind: string }): Promise<StreamRecord | null>;
  /** Pelo sistema (ex.: evento cancelado), sem usuário. */
  endBySystem(streamId: string): Promise<StreamRecord | null>;
}

export type RecordedProviderEvent =
  | { outcome: "applied"; before: StreamRecord; after: StreamRecord }
  | { outcome: "duplicate" }
  | { outcome: "unknown_stream" };

/** Log de ciclo de vida (append-only) + status, gravados juntos numa transação. */
export interface StreamLifecycleLog {
  /**
   * Registra o evento do provedor (idempotente pelo id do evento) e aplica o novo sinal calculado por
   * `next` sobre o estado atual da transmissão (lido com lock).
   */
  recordProviderEvent(
    event: { eventId: string; providerStreamId: string; kind: string; occurredAt: Date },
    next: (current: SignalState) => SignalState,
  ): Promise<RecordedProviderEvent>;
}

/** Leitura pública (página do lugar/evento, Recomendação, Mapa): nunca inclui a chave. */
export interface PublicStreamReader {
  findByTarget(target: StreamTarget): Promise<StreamRecord | null>;
  listLive(limit: number): Promise<StreamRecord[]>;
}

/** Lugares e eventos que o parceiro pode transmitir (APIs públicas de places e events). */
export interface StreamTargets {
  /** O usuário administra o lugar / organizou o evento (e o evento não está cancelado)? */
  owns(userId: string, target: StreamTarget): Promise<boolean>;
  /** Opções para o portal, com nome e link da página pública. */
  optionsFor(userId: string): Promise<Array<StreamTarget & { label: string; href: string }>>;
}

/** O que a Live mostra de um lugar/evento (vem das APIs públicas de places e events). */
export type LiveTargetInfo = StreamTarget & {
  /** Nome do lugar ou título do evento. */
  title: string;
  /** Lugar do evento, ou bairro do lugar. */
  subtitle: string | null;
  /** Horário do evento (ex.: "sáb., 10 de out., 20:00 – 23:30"); null para lugares. */
  whenLabel: string | null;
  href: string;
  /** Coordenadas (o evento usa as do lugar); null se não houver. */
  location: { lat: number; lon: number } | null;
};

/** Dados de vários lugares/eventos em lote (poucas consultas, qualquer que seja a quantidade). */
export interface LiveTargetDirectory {
  describe(targets: StreamTarget[]): Promise<LiveTargetInfo[]>;
}

export const targetKey = (t: StreamTarget) => `${t.entityType}:${t.entityId}`;
