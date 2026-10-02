// Chat da transmissão (#95): mensagens curtas ao lado do player, sempre gravadas pelo servidor.

export const CHAT_LIMITS = {
  /** Caracteres por mensagem. */
  body: 200,
  /** Quantas mensagens quem entra recebe (histórico da sessão). */
  history: 50,
  /** Intervalo mínimo entre mensagens da mesma pessoa, em segundos. */
  rateSeconds: 3,
  /** Trecho da mensagem citada numa resposta. */
  quote: 60,
} as const;

/** Sala do chat: o que o servidor precisa saber da transmissão para abrir, fechar e marcar o anfitrião. */
export type ChatRoom = { streamId: string; ownerId: string; status: "waiting" | "live" | "paused" | "ended"; chatEnabled: boolean; /** Modo lento (#192): segundos entre mensagens de cada pessoa; 0 = desligado. */ slowSeconds: number };

export type ChatMessage = {
  id: string;
  seq: number;
  streamId: string;
  /** null = conta excluída ("Usuário removido"). */
  userId: string | null;
  body: string;
  isHost: boolean;
  replyTo: string | null;
  /** Quantas pessoas curtiram (#190). */
  likes: number;
  createdAt: Date;
};

/** Quem aparece ao lado da mensagem: nome, foto e nível de explorador (nunca o e-mail nem o id). */
export type ChatAuthor = { name: string; avatarUrl: string | null; level: number | null };
export const REMOVED_AUTHOR: ChatAuthor = { name: "Usuário removido", avatarUrl: null, level: null };

export type ChatMessageView = {
  id: string;
  seq: number;
  body: string;
  author: ChatAuthor;
  isHost: boolean;
  replyTo: { id: string; authorName: string; excerpt: string } | null;
  likes: number;
  createdAt: string;
};

/** Por que o chat está fechado (a tela mostra uma mensagem para cada caso; `unavailable` não mostra nada). */
export type ChatClosedReason = "not_live" | "disabled" | "unavailable";

/** Tira espaços das pontas e junta quebras e espaços repetidos: uma mensagem é uma linha. */
export function tidyMessage(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const LINK = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|io|me|app|ly|gg|tv|co|info|biz|xyz|site|online|link|dev)\b(?:\/\S*)?/i;

/** A mensagem tem um link (endereço com http/www ou um domínio conhecido)? */
export function containsLink(text: string): boolean {
  return LINK.test(text);
}

export function excerptOf(body: string, max: number = CHAT_LIMITS.quote): string {
  return body.length <= max ? body : `${body.slice(0, max - 1).trimEnd()}…`;
}

/** Filtro de conteúdo antes de publicar. Começa com lista de palavras; pode virar moderação por IA sem mudar os casos de uso. */
export interface ContentFilter {
  /** true = a mensagem pode ser publicada. */
  allows(text: string): boolean;
}

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** minúsculas, sem acento, sem "leet" (v1ad0 → viado) e sem letras repetidas (pooorra → pora). */
export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1+/g, "$1");
}

/**
 * Lista padrão (pt-BR) de palavrões e termos ofensivos. Fica curta de propósito: é a primeira barreira; o resto é
 * com a moderação do anfitrião e as denúncias. Acrescente termos por LIVE_CHAT_BLOCKED_WORDS (separados por vírgula).
 */
export const DEFAULT_BLOCKED_WORDS = [
  "porra",
  "caralho",
  "merda",
  "bosta",
  "puta",
  "puto",
  "fdp",
  "foda-se",
  "fodase",
  "vsf",
  "vtnc",
  "cuzao",
  "cuzona",
  "arrombado",
  "arrombada",
  "babaca",
  "otario",
  "otaria",
  "idiota",
  "imbecil",
  "retardado",
  "retardada",
  "viado",
  "bicha",
  "sapatao",
  "traveco",
  "vagabunda",
  "vagabundo",
  "piranha",
  "vadia",
  "corno",
  "nazista",
  "filho da puta",
  "filha da puta",
  "vai se foder",
  "vai tomar no cu",
  "tomar no cu",
] as const;

/** Filtro por lista: compara palavras inteiras (e expressões) depois de normalizar a mensagem e a lista. */
export class WordListFilter implements ContentFilter {
  private readonly words: Set<string>;
  private readonly phrases: string[];

  constructor(terms: readonly string[] = DEFAULT_BLOCKED_WORDS) {
    const normalized = terms.map((t) => tokens(normalizeForFilter(t)).join(" ")).filter(Boolean);
    this.words = new Set(normalized.filter((t) => !t.includes(" ")));
    this.phrases = normalized.filter((t) => t.includes(" "));
  }

  allows(text: string): boolean {
    const words = tokens(normalizeForFilter(text));
    if (words.some((w) => this.words.has(w))) return false;
    const line = ` ${words.join(" ")} `;
    return !this.phrases.some((p) => line.includes(` ${p} `));
  }
}

const tokens = (text: string) => text.split(/[^a-z]+/).filter(Boolean);

export function blockedWordsFrom(extra: string | undefined): string[] {
  const custom = (extra ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 40);
  return [...DEFAULT_BLOCKED_WORDS, ...custom];
}
