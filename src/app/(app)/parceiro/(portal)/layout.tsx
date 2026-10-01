import { Store } from "lucide-react";
import { PortalNav, requirePartner } from "@/modules/partners";

// Toda página do portal passa por aqui: só parceiros aprovados entram (RNF05).
export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const { partner } = await requirePartner("/parceiro/inicio");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-brand text-brand-fg">
          <Store className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted">Portal do parceiro</p>
          <p className="truncate text-xl font-bold">{partner.businessName}</p>
        </div>
      </header>
      <PortalNav />
      <div>{children}</div>
    </div>
  );
}
