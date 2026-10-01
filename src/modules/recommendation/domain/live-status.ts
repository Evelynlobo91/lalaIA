/**
 * Porta para o status das transmissões ao vivo (módulo Live). Na composição, `LiveStreamsStatus` lê as
 * lives no ar pela API pública dele (`listActiveStreams`). Se ele falhar, o motor segue sem live (e loga).
 */
export interface LiveStatusReader {
  /** Chaves `kind:id` (ex.: "place:<uuid>", "event:<uuid>") com live ativa agora. */
  liveNow(): Promise<ReadonlySet<string>>;
}
