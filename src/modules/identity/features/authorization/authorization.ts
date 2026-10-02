import "server-only";
import { notFound } from "next/navigation";
import { ForbiddenError, err, type DomainError, type Result } from "@/shared/kernel";
import { can, type Capability } from "../../domain/capabilities";
import type { Role } from "../../domain/roles";
import type { CurrentUser } from "../../domain/session";
import { requireUser, withUser } from "../session/current-user";

export function hasRole(user: Pick<CurrentUser, "roles"> | null, role: Role): boolean {
  return Boolean(user?.roles.includes(role));
}

/**
 * Protege páginas por papel (RNF05). Sem sessão → login. Com sessão mas sem o papel → 404,
 * que não revela que a área existe (ex.: /admin).
 */
export async function requireRole(role: Role, returnTo: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (!hasRole(user, role)) notFound();
  return user;
}

/** Protege Server Actions por papel. O papel é conferido no servidor a cada chamada. */
export function withRole<I, T>(role: Role, handler: (input: I, user: CurrentUser) => Promise<Result<T, DomainError>>) {
  return withUser<I, T>(async (input, user) => {
    if (!hasRole(user, role)) return err(new ForbiddenError());
    return handler(input, user);
  });
}

/**
 * Protege páginas do backoffice por capacidade (#157). Sem sessão → login. Com sessão mas sem a
 * capacidade → 404, que não revela que a área existe.
 */
export async function requireCapability(capability: Capability, returnTo: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (!can(user, capability)) notFound();
  return user;
}

/** Protege Server Actions por capacidade. Conferida no servidor a cada chamada. */
export function withCapability<I, T>(capability: Capability, handler: (input: I, user: CurrentUser) => Promise<Result<T, DomainError>>) {
  return withUser<I, T>(async (input, user) => {
    if (!can(user, capability)) return err(new ForbiddenError());
    return handler(input, user);
  });
}
