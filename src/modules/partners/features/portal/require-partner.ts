import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { hasRole, requireUser, type CurrentUser } from "@/modules/identity";
import { partnerRepository } from "../../composition";
import type { PartnerApplication } from "../../domain/partner";

export type PartnerSession = { user: CurrentUser; partner: PartnerApplication };

/**
 * Protege o portal (RNF05): sem sessão → login; sem papel de parceiro → página de cadastro.
 * Memoizado por requisição (layout e página chamam, uma consulta só).
 */
export const requirePartner = cache(async (returnTo: string): Promise<PartnerSession> => {
  const user = await requireUser(returnTo);
  if (!hasRole(user, "partner")) redirect("/parceiro");

  const partner = await partnerRepository().findByOwner(user.id);
  // Papel concedido mas cadastro ausente/não aprovado (ex.: papel dado manualmente): volta ao cadastro.
  if (!partner || partner.status !== "approved") redirect("/parceiro");
  return { user, partner };
});
