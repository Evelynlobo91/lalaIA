import { BusinessRuleError, err, type DomainError, type Result } from "@/shared/kernel";
import type { PrivacyGate } from "./privacy.use-case";

/** O plano do dono libera a live? (porta implementada pela API pública do módulo billing, #152) */
export type LiveEntitlement = (ownerId: string) => Promise<boolean>;

/**
 * Trava para colocar uma live no ar: o plano do dono precisa liberar a live e ele precisa ter aceitado as
 * diretrizes de privacidade (#55). O plano é conferido primeiro: sem ele, nem adianta pedir o aceite.
 * Pausar e encerrar não passam por aqui.
 */
export function liveGateWith(entitled: LiveEntitlement, privacy: Pick<PrivacyGate, "check">): Pick<PrivacyGate, "check"> {
  return {
    async check(ownerId: string, action: "provision" | "activate"): Promise<Result<true, DomainError>> {
      if (!(await entitled(ownerId))) {
        return err(new BusinessRuleError("plan_feature_required", "O plano atual não inclui transmissão ao vivo. Fale com o time do LalaIA para mudar de plano."));
      }
      return privacy.check(ownerId, action);
    },
  };
}
