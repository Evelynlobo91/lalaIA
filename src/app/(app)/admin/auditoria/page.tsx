import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditLogView, auditLogView } from "@/modules/backoffice";
import { can, requireCapability } from "@/modules/identity";

export const metadata: Metadata = { title: "Auditoria · Backoffice", robots: { index: false } };
// Registro de trabalho: sempre os dados de agora.
export const dynamic = "force-dynamic";

export default async function AdminAuditoriaPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const admin = await requireCapability("audit:read", "/admin/auditoria");
  const result = await auditLogView({ isAdmin: can(admin, "audit:read") }, await searchParams);
  if (!result.ok) notFound();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-muted">Quem fez o quê e quando no backoffice. O registro não pode ser alterado nem apagado.</p>
      </header>
      <AuditLogView view={result.value} />
    </div>
  );
}
