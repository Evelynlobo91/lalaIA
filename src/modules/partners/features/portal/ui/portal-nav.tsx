"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui";
import { portalSections } from "../portal-sections";

/** Abas do portal: roláveis no celular, fileira completa em telas maiores. */
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal do parceiro" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-2 border-b border-border">
        {portalSections.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium",
                  active ? "border-brand text-brand" : "border-transparent text-muted hover:text-fg",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
