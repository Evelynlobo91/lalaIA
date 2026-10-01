import type { LiveStatusReader } from "../domain/live-status";

/**
 * Stub da porta de Live enquanto o módulo Live não existe: nenhuma transmissão ativa.
 * Trocar por um adaptador real é só mudar a composição.
 */
export class NoLiveYet implements LiveStatusReader {
  async liveNow(): Promise<ReadonlySet<string>> {
    return new Set();
  }
}
