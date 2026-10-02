import type { StreamControlStore, StreamRepository } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";

/**
 * A assinatura do dono foi suspensa (#154). Se o plano que sobrou para ele não libera a live, as transmissões
 * dele são encerradas: a chave é desligada no provedor e o player some. Com o pagamento, ele ativa de novo.
 * Se o plano que sobrou ainda libera a live, nada acontece.
 */
export class EndStreamsWithoutPlan {
  constructor(
    private readonly streams: Pick<StreamRepository, "listByOwner">,
    private readonly control: Pick<StreamControlStore, "endBySystem">,
    private readonly provider: () => StreamingProvider,
    private readonly entitled: (ownerId: string) => Promise<boolean>,
    private readonly log: { warn(message: string, fields?: Record<string, unknown>): void },
  ) {}

  async execute(ownerId: string): Promise<number> {
    if (await this.entitled(ownerId)) return 0;
    const open = (await this.streams.listByOwner(ownerId)).filter((s) => s.control !== "ended");
    let ended = 0;
    for (const stream of open) {
      await this.provider()
        .disable(stream.providerStreamId)
        .catch((error: unknown) => this.log.warn("não foi possível desligar a transmissão no provedor (assinatura suspensa)", { streamId: stream.id, err: error }));
      if (await this.control.endBySystem(stream.id)) ended++;
    }
    return ended;
  }
}
