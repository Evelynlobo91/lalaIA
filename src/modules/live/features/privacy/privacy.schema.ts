import { z } from "zod";
import { LIVE_GUIDELINES_VERSION } from "../../domain/privacy";

const confirmed = z.literal("on", { error: "Confirme este item para continuar." });

/** Checklist das diretrizes: todos os itens marcados, e a versão que a pessoa leu. */
export const acceptGuidelinesSchema = z.object({
  version: z.literal(LIVE_GUIDELINES_VERSION, { error: "As diretrizes mudaram. Recarregue a página e leia de novo." }),
  wideHighShot: confirmed,
  noAudio: confirmed,
  physicalNotice: confirmed,
  lgpd: confirmed,
});
