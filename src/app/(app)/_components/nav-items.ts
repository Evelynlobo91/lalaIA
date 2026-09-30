import { Compass, Map, Sparkles, Target, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; highlight?: boolean };

// Destinos principais do app. "Me Surpreenda" é o carro-chefe e ganha destaque.
export const navItems: NavItem[] = [
  { href: "/", label: "Explorar", icon: Compass },
  { href: "/mapa", label: "Mapa", icon: Map },
  { href: "/surpreenda", label: "Me Surpreenda", icon: Sparkles, highlight: true },
  { href: "/missoes", label: "Missões", icon: Target },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
