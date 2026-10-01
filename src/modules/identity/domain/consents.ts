/** Consentimentos granulares (LGPD, #25). Revogáveis a qualquer momento. */
export type Consents = { analytics: boolean; geolocation: boolean };

/** Sem escolha registrada: as métricas são anônimas e o GPS é sempre pedido pelo navegador. */
export const defaultConsents: Consents = { analytics: true, geolocation: true };

export interface ConsentRepository {
  find(userId: string): Promise<(Consents & { updatedAt: Date }) | null>;
  save(userId: string, consents: Consents): Promise<void>;
}

/**
 * Cookies de preferência que espelham os consentimentos para o navegador (lidos pelo rastreamento de
 * visualizações e pelo botão "Perto de mim"). Também valem para quem não tem conta.
 */
export const CONSENT_COOKIES = { analytics: "lalaia-analytics", geolocation: "lalaia-geo" } as const;
