// API pública do módulo identity.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { UserPreferencesReader } from "./domain/preferences";
import type { CurrentUser } from "./domain/session";
import { ListUsersForModeration } from "./features/moderation/list-users";
import { GrantRole } from "./features/roles/grant-role";
import type { Role } from "./domain/roles";
import { DefaultingPreferencesReader } from "./features/preferences-reader/preferences-reader";
import { PostgresPreferencesRepository } from "./infra/postgres-preferences-repository";
import { PostgresRoleRepository } from "./infra/postgres-role-repository";
import { avatarPublicUrl } from "./infra/supabase-avatar-storage";
import { PostgresUserCounts } from "./infra/postgres-user-counts";
import { PostgresConsentRepository } from "./infra/postgres-consent-repository";
import { GetConsents } from "./features/lgpd/lgpd.use-case";

export { RegisterForm } from "./features/register/ui/register-form";
export { LoginForm } from "./features/login/ui/login-form";
export { TeamRolesForm } from "./features/roles/ui/team-roles-form";
export { teamRoles, type TeamRole } from "./features/roles/manage-team-roles";
export { LogoutButton } from "./features/logout/ui/logout-button";
export { EditProfileForm } from "./features/edit-profile/ui/edit-profile-form";
export { PreferencesForm } from "./features/edit-preferences/ui/preferences-form";
export { AvatarForm } from "./features/upload-avatar/ui/avatar-form";
export { confirmEmailRoute } from "./features/confirm-email/confirm-email.route";
export { getCurrentUser, requireUser, withUser } from "./features/session/current-user";
export { hasRole, requireCapability, requireRole, withCapability, withRole } from "./features/authorization/authorization";
export { can, capabilities, internalRoleDescriptions, internalRoleLabels, internalRoles, type Capability, type InternalRole } from "./domain/capabilities";
import { internalRoles as allInternalRoles, roleCapabilities, type Capability as Cap } from "./domain/capabilities";
export { CURRENT_TERMS_VERSION } from "./domain/terms";
export type { CurrentUser } from "./domain/session";
export type { Role, UserSummary } from "./domain/roles";
export { groupSizes, budgetOptions, type UserPreferences, type UserPreferencesReader, type GroupSize } from "./domain/preferences";

/** Preferências do usuário (com padrões). Usado pela Recomendação e pelo perfil. */
export const userPreferences: () => UserPreferencesReader = lazy(() => new DefaultingPreferencesReader(new PostgresPreferencesRepository(sql())));

const listUsers = lazy(() => new ListUsersForModeration(new PostgresRoleRepository(sql())));

/** Moderação (admin): usuários mais recentes com seus papéis. */
export function listUsersForModeration(actor: CurrentUser, limit?: number, text?: string) {
  return listUsers().execute(actor, limit, text);
}

const grantRoleUseCase = lazy(() => new GrantRole(sql()));

/** Concede um papel a um usuário (idempotente). Ex.: o módulo partners, ao aprovar um parceiro. */
export function grantRole(userId: string, role: Role, grantedBy: string | null) {
  return grantRoleUseCase().execute(userId, role, grantedBy);
}

const directory = lazy(() => new PostgresRoleRepository(sql()));

/** Nome e e-mail de usuários por id (ex.: fila de revisão de parceiros). Uso restrito a telas de admin/dono. */
export function usersByIds(ids: string[]) {
  return directory().byIds([...new Set(ids)]);
}

/**
 * Perfil público de usuários por id: nome de exibição e foto (ex.: autor de uma mensagem no chat da live).
 * Nunca o e-mail. Conta inexistente fica de fora.
 */
export async function publicProfiles(ids: string[]): Promise<Array<{ id: string; displayName: string; avatarUrl: string | null }>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const rows = await directory().publicByIds([...new Set(ids)]);
  return rows.map((r) => ({ id: r.id, displayName: r.displayName, avatarUrl: r.avatarPath && supabaseUrl ? avatarPublicUrl(supabaseUrl, r.avatarPath) : null }));
}

/** Pessoas do time que têm a capacidade (ex.: quem pode ser responsável por um lead). Só id e nome. */
export function usersWithCapability(capability: Cap) {
  return directory().withAnyRole(allInternalRoles.filter((role) => roleCapabilities[role].includes(capability)));
}

/** Contagens de contas (criadas num período e total), para as métricas gerais do backoffice (#145). */
export const userCounts = lazy(() => new PostgresUserCounts(sql()));

// ---------------------------------------------------------------------------------------------------
// LGPD (#25): consentimentos, exportação e exclusão de conta
// ---------------------------------------------------------------------------------------------------

export { ConsentsForm } from "./features/lgpd/ui/consents-form";
export { DeleteAccountForm } from "./features/lgpd/ui/delete-account-form";
export { exportPersonalDataRoute } from "./features/lgpd/lgpd.route";
export type { PersonalDataSource, PersonalDataExport } from "./features/lgpd/lgpd.use-case";
export { CONSENT_COOKIES, type Consents } from "./domain/consents";

const getConsents = lazy(() => new GetConsents(new PostgresConsentRepository(sql())));

/** Consentimentos da pessoa (com os padrões, se nunca escolheu). O id vem sempre da sessão. */
export function consentsOf(userId: string) {
  return getConsents().execute(userId);
}

/** Usado pelo Analytics antes de contar uma interação ligada a alguém (ex.: favoritar). */
export async function allowsAnalytics(userId: string): Promise<boolean> {
  return (await getConsents().execute(userId)).analytics;
}

