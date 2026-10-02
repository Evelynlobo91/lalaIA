import { ShieldCheck } from "lucide-react";
import { BackofficeNav } from "@/modules/backoffice";
import { requireRole } from "@/modules/identity";

// Toda página do backoffice passa por aqui: só admin entra; para os demais a área não existe (404, RNF05).
export default async function BackofficeLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireRole("admin", "/admin");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-fg">
          <ShieldCheck className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Backoffice</p>
          <p className="truncate text-xl font-bold">{admin.displayName}</p>
        </div>
      </header>
      <BackofficeNav />
      <div>{children}</div>
    </div>
  );
}
