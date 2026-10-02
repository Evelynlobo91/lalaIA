import { ShieldCheck } from "lucide-react";
import { BackofficeNav, sectionsFor } from "@/modules/backoffice";
import { can, requireCapability } from "@/modules/identity";

// Toda página do backoffice passa por aqui: só papéis internos entram; para os demais a área não existe (404, RNF05).
// Cada página confere de novo a capacidade da própria seção (#157).
export default async function BackofficeLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireCapability("backoffice:access", "/admin");
  const hrefs = sectionsFor((capability) => can(user, capability)).map((section) => section.href);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-fg">
          <ShieldCheck className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Backoffice</p>
          <p className="truncate text-xl font-bold">{user.displayName}</p>
        </div>
      </header>
      <BackofficeNav hrefs={hrefs} />
      <div>{children}</div>
    </div>
  );
}
