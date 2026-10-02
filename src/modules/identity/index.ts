// API pública do módulo identity.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { UserPreferencesReader } from "./domain/preferences";
import type { CurrentUser } from "./domain/session";
import { ListUsersForModeration } from "./features/moderation/list-users";
import { DefaultingPreferencesReader } from "./features/preferences-reader/preferences-reader";
import { PostgresPreferencesRepository } from "./infra/postgres-preferences-repository";
import { PostgresRoleRepository } from "./infra/postgres-role-repository";

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
