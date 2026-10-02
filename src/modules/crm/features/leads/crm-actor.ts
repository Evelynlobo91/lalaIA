import { can, type CurrentUser } from "@/modules/identity";
import type { CrmActor } from "../../domain/lead";

/** Quem age no CRM, a partir da sessão: o id e o que o papel permite (#157). */
export const crmActor = (user: Pick<CurrentUser, "id" | "roles">): CrmActor => ({ id: user.id, canRead: can(user, "leads:read"), canWrite: can(user, "leads:write") });
