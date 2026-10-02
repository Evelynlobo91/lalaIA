import type { LiveStatusReader } from "../domain/live-status";

type ActiveStream = { entityType: string; entityId: string };

/**
 * Adaptador da porta `LiveStatusReader` para o módulo Live: lê as lives no ar pela API pública dele
 * (`listActiveStreams`, injetada na composição) e devolve as chaves `kind:id` que o score usa.
 */
export class LiveStreamsStatus implements LiveStatusReader {
  constructor(private readonly listActive: () => Promise<ActiveStream[]>) {}

  async liveNow(): Promise<ReadonlySet<string>> {
    return new Set((await this.listActive()).map((s) => `${s.entityType}:${s.entityId}`));
  }
}
