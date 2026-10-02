import { BarChart3, Building2, Home, KanbanSquare, ScrollText, Store, Users, Wallet, type LucideIcon } from "lucide-react";

import type { Capability } from "@/modules/identity";

export type BackofficeSection = { href: string; label: string; description: string; icon: LucideIcon; /** Capacidade exigida para ver e abrir a seção (#157). */ capability: Capability };

export const BACKOFFICE_HOME = "/admin";

// Seções do backoffice. Arquivo comum (sem "use client"): usado pela navegação (cliente) e pelas páginas (servidor).
// Cada seção é preenchida pelo slice do módulo dono (partners, crm, billing, analytics...).
export const backofficeSections: BackofficeSection[] = [
  { href: BACKOFFICE_HOME, label: "Início", description: "Visão geral do backoffice.", icon: Home, capability: "backoffice:access" },
  { href: "/admin/usuarios", label: "Usuários", description: "Contas mais recentes e seus papéis.", icon: Users, capability: "users:read" },
  { href: "/admin/parceiros", label: "Parceiros", description: "Cadastros de parceiros e pedidos de vínculo com lugares.", icon: Store, capability: "partners:review" },
  { href: "/admin/conteudo", label: "Conteúdo", description: "Estabelecimentos, eventos e missões de toda a plataforma.", icon: Building2, capability: "content:edit" },
  { href: "/admin/leads", label: "Leads", description: "Funil de captação de estabelecimentos.", icon: KanbanSquare, capability: "leads:read" },
  { href: "/admin/financeiro", label: "Financeiro", description: "Planos, assinaturas, faturas e inadimplência.", icon: Wallet, capability: "billing:read" },
  { href: "/admin/metricas", label: "Métricas", description: "Números gerais da plataforma.", icon: BarChart3, capability: "metrics:read" },
  { href: "/admin/auditoria", label: "Auditoria", description: "Quem fez o quê e quando no backoffice.", icon: ScrollText, capability: "audit:read" },
];

/** A seção está ativa na rota atual? O início só casa com a própria rota; as demais também com as subpáginas. */
export function isSectionActive(pathname: string, href: string): boolean {
  if (href === BACKOFFICE_HOME) return pathname === BACKOFFICE_HOME;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Seções que a pessoa pode ver, na ordem do menu. `allowed` responde se ela tem a capacidade. */
export function sectionsFor(allowed: (capability: Capability) => boolean): BackofficeSection[] {
  return backofficeSections.filter((section) => allowed(section.capability));
}
