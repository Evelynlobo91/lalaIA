import type { DomainEventPublisher } from "@/shared/events";
import { err, ok, type DomainError, type Result } from "@/shared/kernel";
import { signalAfter, type StreamLifecycleLog } from "../../domain/stream";
import type { StreamingProvider } from "../../domain/streaming-provider";
import { providerEventSchema } from "./webhooks.schema";

export type WebhookOutcome = { received: number; applied: number; duplicates: number; unknown: number; invalid: number };

/**
 * RNF18 — Recebe o webhook do provedor: confere a assinatura, grava cada evento no log de ciclo de vida
 * (idempotente) e atualiza o status. Publica `live.StreamStatusChanged` só quando o status muda,
 * depois de gravar.
 */
export class HandleProviderWebhook {
  constructor(
    private readonly provider: () => StreamingProvider,
    private readonly log: StreamLifecycleLog,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(rawBody: string, headers: Headers): Promise<Result<WebhookOutcome, DomainError>> {
    const verified = this.provider().verifyWebhook(rawBody, headers);
    if (!verified.ok) return err(verified.error);

    const outcome: WebhookOutcome = { received: verified.value.length, applied: 0, duplicates: 0, unknown: 0, invalid: 0 };
    for (const candidate of verified.value) {
      const parsed = providerEventSchema.safeParse(candidate);
      if (!parsed.success) {
        outcome.invalid++;
        continue;
      }
      const event = parsed.data;
      const recorded = await this.log.recordProviderEvent(event, (current) => signalAfter(current, event));
      if (recorded.outcome === "duplicate") outcome.duplicates++;
      else if (recorded.outcome === "unknown_stream") outcome.unknown++;
      else {
        outcome.applied++;
        const { before, after } = recorded;
        if (before.status !== after.status) {
          await this.events.publish("live.StreamStatusChanged", { streamId: after.id, entityType: after.entityType, entityId: after.entityId, status: after.status });
        }
      }
    }
    return ok(outcome);
  }
}
