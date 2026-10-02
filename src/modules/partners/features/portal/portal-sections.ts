import { BarChart3, CalendarDays, CreditCard, Home, MapPin, Megaphone, Radio, Target, TicketPercent, Users, type LucideIcon } from "lucide-react";

export type PortalSection = { href: string; label: string; icon: LucideIcon };

// Seções do portal. Arquivo comum (sem "use client"): usado pela navegação (cliente) e pelas páginas (servidor).
// Cada seção é preenchida pelo slice do módulo dono (lugares, eventos, live, missões, analytics).
export const portalSections: PortalSection[] = [
  { href: "/parceiro/inicio", label: "Início", icon: Home },
  { href: "/parceiro/lugares", label: "Meus lugares", icon: MapPin },
  { href: "/parceiro/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/parceiro/live", label: "Live", icon: Radio },
  { href: "/parceiro/missoes", label: "Missões", icon: Target },
  { href: "/parceiro/ofertas", label: "Ofertas", icon: TicketPercent },
  { href: "/parceiro/destaque", label: "Destaque", icon: Megaphone },
  { href: "/parceiro/dados", label: "Dados", icon: BarChart3 },
  { href: "/parceiro/equipe", label: "Equipe", icon: Users },
  { href: "/parceiro/assinatura", label: "Assinatura", icon: CreditCard },
];
