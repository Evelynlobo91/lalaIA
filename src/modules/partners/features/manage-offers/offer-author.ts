import "server-only";
import type { CurrentUser } from "@/modules/identity";
import { ForbiddenError, err, type DomainError, type Result } from "@/shared/kernel";
import { approvedPartnerIdOf } from "../../composition";
import type { OfferAuthor } from "./manage-offers.use-cases";

/**
 * Parceiro aprovado a partir da sessão (nunca do formulário). Fica fora dos arquivos "use server":
 * exportado de lá, viraria uma action pública.
 */
export async function asOfferAuthor<T>(user: CurrentUser, run: (author: OfferAuthor) => Promise<Result<T, DomainError>>): Promise<Result<T, DomainError>> {
  const partnerId = await approvedPartnerIdOf(user.id);
  if (!partnerId) return err(new ForbiddenError("Seu cadastro de parceiro precisa estar aprovado."));
  return run({ userId: user.id, partnerId });
}
