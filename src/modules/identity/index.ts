// API pública do módulo identity.
export { RegisterForm } from "./features/register/ui/register-form";
export { LoginForm } from "./features/login/ui/login-form";
export { LogoutButton } from "./features/logout/ui/logout-button";
export { confirmEmailRoute } from "./features/confirm-email/confirm-email.route";
export { getCurrentUser, requireUser } from "./features/session/current-user";
export { CURRENT_TERMS_VERSION } from "./domain/terms";
export type { CurrentUser } from "./domain/session";
