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
