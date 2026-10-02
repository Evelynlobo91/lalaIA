import "server-only";
import { TrackView } from "@/modules/analytics";
import { errorReporter, logger } from "@/shared/observability";
import { getLivePlayback } from "../../../composition";
import type { StreamEntityType } from "../../../domain/stream";
import { liveTargetSchema } from "../player.schema";
import type { LivePlayback } from "../player.use-case";
import { LiveStage } from "../../stream-states/ui/live-stage";

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
 * Server component para o slot `extras` das páginas de lugar e evento: busca a live do lugar/evento e
 * mostra o player com os estados (#51). Sem transmissão → nada. `PlaceDetailCard`/`EventDetailCard` não conhecem o módulo live.
 */
export async function LivePlayerFor({ entityType, entityId, title }: { entityType: StreamEntityType; entityId: string; title: string }) {
  const playback = await playbackFor(entityType, entityId);
  // Sem transmissão, ou encerrada antes de a pessoa chegar: nada na página. "Encerrada" só aparece para quem
  // estava acompanhando (transição ao vivo → encerrada, sem recarregar).
  if (!playback || playback.status === "ended") return null;

  return (
    <LiveStage
      entityType={entityType}
      entityId={entityId}
      initial={{ status: playback.status, streamId: playback.streamId, playbackUrl: playback.playbackUrl }}
      title={title}
      onWatch={<TrackView kind="live_view" entityType="live" entityId={playback.streamId} />}
    />
  );
}
