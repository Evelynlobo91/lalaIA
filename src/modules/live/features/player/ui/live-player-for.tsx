import "server-only";
import { TrackView } from "@/modules/analytics";
import { errorReporter, logger } from "@/shared/observability";
import { getLivePlayback, getStreamContext } from "../../../composition";
import type { LiveTargetInfo, StreamEntityType } from "../../../domain/stream";
import { liveTargetSchema } from "../player.schema";
import type { LivePlayback } from "../player.use-case";
import { LiveStage } from "../../stream-states/ui/live-stage";
import { liveStatusView } from "../../stream-states/stream-states.use-case";

async function playbackFor(entityType: StreamEntityType, entityId: string): Promise<LivePlayback | null> {
  const target = liveTargetSchema.safeParse({ entityType, entityId });
  if (!target.success) return null;
  try {
    return await getLivePlayback().execute(target.data);
  } catch (error) {
    // A live é um complemento: uma falha aqui não pode derrubar a página do lugar/evento.
    logger().error("falha ao carregar a live", { entityType, err: error });
    errorReporter().capture(error, { entityType });
    return null;
  }
}

/**
 * Evento, lugar e horário (#53), com a hora da consulta (para o "há X min" ser igual no servidor e na
 * hidratação). Sem o contexto, a live aparece mesmo assim (não derruba a página).
 */
async function contextFor(entityType: StreamEntityType, entityId: string): Promise<{ info: LiveTargetInfo | null; renderedAt: number }> {
  try {
    return { info: await getStreamContext().execute({ entityType, entityId }), renderedAt: Date.now() };
  } catch (error) {
    logger().error("falha ao carregar o contexto da live", { entityType, err: error });
    errorReporter().capture(error, { entityType });
    return { info: null, renderedAt: Date.now() };
  }
}

/**
 * Server component para o slot `extras` das páginas de lugar e evento: busca a live do lugar/evento e
 * mostra o player com os estados (#51). Sem transmissão → nada. `PlaceDetailCard`/`EventDetailCard` não conhecem o módulo live.
 */
export async function LivePlayerFor({ entityType, entityId, title }: { entityType: StreamEntityType; entityId: string; title: string }) {
  const playback = await playbackFor(entityType, entityId);
  // Sem transmissão, ou encerrada antes de a pessoa chegar: nada na página. "Encerrada" só aparece para quem
  // estava acompanhando (transição ao vivo → encerrada, sem recarregar).
  if (!playback || playback.status === "ended") return null;
  const { info: context, renderedAt } = await contextFor(entityType, entityId);

  return (
    <LiveStage
      entityType={entityType}
      entityId={entityId}
      initial={liveStatusView(playback)}
      context={context && { entityType: context.entityType, title: context.title, subtitle: context.subtitle, whenLabel: context.whenLabel }}
      renderedAt={renderedAt}
      title={title}
      onWatch={<TrackView kind="live_view" entityType="live" entityId={playback.streamId} />}
    />
  );
}
