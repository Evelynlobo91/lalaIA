import { can, type CurrentUser } from "@/modules/identity";
import type { BillingActor } from "../../domain/plan";

/** Quem age na cobrança, a partir da sessão: o id e o que o papel permite (#157). */
export const billingActor = (user: Pick<CurrentUser, "id" | "roles">): BillingActor => ({ id: user.id, canRead: can(user, "billing:read"), canWrite: can(user, "billing:write") });
