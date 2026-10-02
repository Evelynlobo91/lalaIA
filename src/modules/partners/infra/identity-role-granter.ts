import { grantRole } from "@/modules/identity";
import type { PartnerRoleGranter } from "../domain/partner";

/** Adaptador: concede o papel pela API pública do módulo identity (sem tocar nas tabelas dele). */
export const identityRoleGranter: PartnerRoleGranter = {
  grantPartner: (userId, grantedBy) => grantRole(userId, "partner", grantedBy),
};
