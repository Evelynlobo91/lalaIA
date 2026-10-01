// Diretrizes de privacidade e enquadramento de câmera da Live (RNF16/RNF17): minimizar a exposição de
// frequentadores. O parceiro aceita antes de gerar a chave ou ativar uma transmissão.

/** Versão vigente das diretrizes. Mudou o texto de forma relevante → nova versão → novo aceite. */
export const LIVE_GUIDELINES_VERSION = "2026-10";

/** Itens do checklist (todos obrigatórios). */
export const PRIVACY_CHECKLIST = [
  { id: "wideHighShot", label: "A câmera fica no alto, em plano aberto, mostrando o ambiente, sem focar em rostos, mesas de perto, caixa ou banheiros." },
  { id: "noAudio", label: "A transmissão vai sem áudio (o microfone fica desligado no OBS/Larix)." },
  { id: "physicalNotice", label: "Há um aviso visível no local informando que o ambiente é transmitido ao vivo." },
  { id: "lgpd", label: "Respeito a LGPD: se alguém pedir para não aparecer, ajusto o enquadramento ou pauso a live." },
] as const;

export type PrivacyChecklistItem = (typeof PRIVACY_CHECKLIST)[number]["id"];

/** Aceite registrado (com a data). */
export type PrivacyAgreement = { version: string; acceptedAt: Date };

/** Persistência do aceite. Escrita como o próprio usuário (asUser + RLS: só parceiro, só em nome próprio). */
export interface PrivacyAgreements {
  /** Último aceite do usuário (qualquer versão), ou null. */
  find(userId: string): Promise<PrivacyAgreement | null>;
  /** Registra (ou renova) o aceite da versão. null se o banco não permitir (ex.: não é parceiro). */
  accept(userId: string, version: string): Promise<PrivacyAgreement | null>;
}

/** O aceite vale se for da versão vigente. */
export const isCurrent = (agreement: PrivacyAgreement | null): agreement is PrivacyAgreement => agreement?.version === LIVE_GUIDELINES_VERSION;
