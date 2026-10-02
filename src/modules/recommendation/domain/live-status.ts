/**
 * Porta para o status das transmissões ao vivo (módulo Live, epic futuro). Quando ele existir, um
 * adaptador lê as lives ativas pela API pública dele; até lá, `NoLiveYet` (nenhuma live).
 */
export interface LiveStatusReader {
  /** Chaves `kind:id` (ex.: "place:<uuid>", "event:<uuid>") com live ativa agora. */
  liveNow(): Promise<ReadonlySet<string>>;
}
