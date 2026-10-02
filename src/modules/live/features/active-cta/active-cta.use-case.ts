import { windowAt, type CtaRecord, type CtaType } from "../../domain/cta";
import type { StreamStatus } from "../../domain/stream";

/** Leitura pública dos CTAs de uma transmissão (pelo sistema: o público não lê a tabela). */
export interface StreamCtaReader {
  listForStream(streamId: string): Promise<CtaRecord[]>;
}

/** O que o público recebe do CTA que está valendo: conteúdo, destino e até quando (ISO) ele fica na tela. */
export type ActiveCtaView = { id: string; type: CtaType; title: string; body: string | null; buttonLabel: string; href: string; external: boolean; until: string };

/**
 * O CTA que vale em `now`: o de maior prioridade entre os que estão na janela; empate → o mais antigo.
 * Um por vez. Fora da janela de todos, null.
 */
export function pickActiveCta(ctas: CtaRecord[], now: Date, liveSince: Date | null): ActiveCtaView | null {
  const running = ctas
    .map((cta) => ({ cta, window: windowAt(cta.schedule, now, liveSince) }))
    .filter((c): c is { cta: CtaRecord; window: NonNullable<ReturnType<typeof windowAt>> } => c.window !== null)
    .sort((a, b) => a.cta.priority - b.cta.priority || a.cta.createdAt.getTime() - b.cta.createdAt.getTime());
  const first = running[0];
  if (!first) return null;
  const { cta, window } = first;
  return { id: cta.id, type: cta.type, title: cta.title, body: cta.body, buttonLabel: cta.buttonLabel, href: cta.href, external: cta.external, until: window.end.toISOString() };
}

type Logger = { warn(message: string, fields?: Record<string, unknown>): void };

/**
 * #179 — CTA ativo agora de uma transmissão, calculado na leitura (sem job): a página já consulta o status da
 * live a cada poucos segundos, então a chamada aparece e some com o mesmo atraso. Só com a live AO VIVO;
 * pausada, encerrada ou aguardando sinal → nada. O CTA é um complemento: se a leitura falhar, a live segue sem ele.
 */
export class GetActiveCta {
  constructor(
    private readonly ctas: StreamCtaReader,
    private readonly log: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(stream: { streamId: string; status: StreamStatus; liveSince: Date | null } | null): Promise<ActiveCtaView | null> {
    if (!stream || stream.status !== "live") return null;
    try {
      return pickActiveCta(await this.ctas.listForStream(stream.streamId), this.now(), stream.liveSince);
    } catch (error) {
      this.log.warn("chamadas da live indisponíveis", { streamId: stream.streamId, err: error });
      return null;
    }
  }
}
