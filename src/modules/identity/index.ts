// API pública do módulo identity.
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { UserPreferencesReader } from "./domain/preferences";
import { DefaultingPreferencesReader } from "./features/preferences-reader/preferences-reader";
import { PostgresPreferencesRepository } from "./infra/postgres-preferences-repository";

export { RegisterForm } from "./features/register/ui/register-form";
export { LoginForm } from "./features/login/ui/login-form";
export { LogoutButton } from "./features/logout/ui/logout-button";
export { EditProfileForm } from "./features/edit-profile/ui/edit-profile-form";
export { PreferencesForm } from "./features/edit-preferences/ui/preferences-form";
export { AvatarForm } from "./features/upload-avatar/ui/avatar-form";
export { confirmEmailRoute } from "./features/confirm-email/confirm-email.route";
export { getCurrentUser, requireUser } from "./features/session/current-user";
export { CURRENT_TERMS_VERSION } from "./domain/terms";
export type { CurrentUser } from "./domain/session";
export { groupSizes, budgetOptions, type UserPreferences, type UserPreferencesReader, type GroupSize } from "./domain/preferences";

/** Preferências do usuário (com padrões). Usado pela Recomendação e pelo perfil. */
export const userPreferences: () => UserPreferencesReader = lazy(() => new DefaultingPreferencesReader(new PostgresPreferencesRepository(sql())));
