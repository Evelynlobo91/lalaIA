"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui";

const tabs = [
  { href: "/entrar", label: "Entrar" },
  { href: "/cadastro", label: "Criar conta" },
] as const;

/** Alternância Entrar / Criar conta. São links (páginas diferentes), marcados com aria-current. */
export function AuthTabs() {
  const pathname = usePathname();
  // Termos e privacidade usam o mesmo layout, mas não são login/cadastro.
  if (!tabs.some((tab) => tab.href === pathname)) return null;

  return (
    <nav aria-label="Acesso à conta" className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1">
      {tabs.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-full text-sm font-semibold transition",
              active ? "bg-brand text-brand-fg shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
