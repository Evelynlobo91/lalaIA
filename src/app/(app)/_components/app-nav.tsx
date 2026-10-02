"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, Logo } from "@/shared/ui";
import { isActive, navItems } from "./nav-items";

/** Navegação principal: barra inferior no celular, barra lateral a partir do tablet. */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur",
        "md:inset-y-0 md:left-0 md:right-auto md:w-60 md:border-r md:border-t-0 md:pb-0",
      )}
    >
      <Link href="/" className="hidden items-center px-6 py-6 md:flex">
        <Logo className="h-9" />
      </Link>
      <ul className="mx-auto flex max-w-lg items-stretch justify-around md:mx-0 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {navItems.map(({ href, label, icon: Icon, highlight }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                  "md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm",
                  active ? "text-brand" : "text-muted hover:text-fg",
                  active && "md:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full",
                    highlight && "size-9 bg-brand text-brand-fg md:size-7",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5", highlight && "md:size-4")} strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="text-center leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
