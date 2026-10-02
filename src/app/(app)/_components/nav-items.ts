import { Compass, House, Map, Sparkles, User, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; highlight?: boolean };

// Destinos principais, na ordem do protótipo. "Me Surpreenda" é o carro-chefe e ganha destaque no centro.
// Missões saíram da barra e ficam nos atalhos do início e no perfil.
export const navItems: NavItem[] = [
  { href: "/", label: "Início", icon: House },
  { href: "/buscar", label: "Explorar", icon: Compass },
  { href: "/surpreenda", label: "Me Surpreenda", icon: Sparkles, highlight: true },
  { href: "/mapa", label: "Mapa", icon: Map },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
