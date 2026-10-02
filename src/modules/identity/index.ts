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
import { PostgresUserCounts } from "./infra/postgres-user-counts";
import { PostgresConsentRepository } from "./infra/postgres-consent-repository";
import { GetConsents } from "./features/lgpd/lgpd.use-case";

export { RegisterForm } from "./features/register/ui/register-form";
export { LoginForm } from "./features/login/ui/login-form";
export { LogoutButton } from "./features/logout/ui/logout-button";
export { EditProfileForm } from "./features/edit-profile/ui/edit-profile-form";
export { PreferencesForm } from "./features/edit-preferences/ui/preferences-form";
export { AvatarForm } from "./features/upload-avatar/ui/avatar-form";
export { confirmEmailRoute } from "./features/confirm-email/confirm-email.route";
export { getCurrentUser, requireUser, withUser } from "./features/session/current-user";
export { hasRole, requireRole, withRole } from "./features/authorization/authorization";
export { CURRENT_TERMS_VERSION } from "./domain/terms";
export type { CurrentUser } from "./domain/session";
export type { Role, UserSummary } from "./domain/roles";
export { groupSizes, budgetOptions, type UserPreferences, type UserPreferencesReader, type GroupSize } from "./domain/preferences";

/** Preferências do usuário (com padrões). Usado pela Recomendação e pelo perfil. */
export const userPreferences: () => UserPreferencesReader = lazy(() => new DefaultingPreferencesReader(new PostgresPreferencesRepository(sql())));

const listUsers = lazy(() => new ListUsersForModeration(new PostgresRoleRepository(sql())));

/** Moderação (admin): usuários mais recentes com seus papéis. */
export function listUsersForModeration(actor: CurrentUser, limit?: number) {
  return listUsers().execute(actor, limit);
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

