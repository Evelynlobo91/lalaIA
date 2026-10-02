import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/shared/ui";

/** Seção do portal ainda não implementada: diz o que vai ter ali. */
export function PortalPlaceholder({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <EmptyState icon={icon} title="Em breve" description={description} />
    </div>
  );
}
