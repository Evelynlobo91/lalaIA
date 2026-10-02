import Form from "next/form";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { TeamRolesForm, can, internalRoleLabels, listUsersForModeration, requireCapability, type Role } from "@/modules/identity";
import { Avatar, Badge, Button, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Usuários · Backoffice", robots: { index: false } };
// Lista de trabalho: sempre os dados de agora.
export const dynamic = "force-dynamic";

const roleLabels: Record<Role, string> = { partner: "Parceiro", ...internalRoleLabels };

export default async function AdminUsuariosPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const viewer = await requireCapability("users:read", "/admin/usuarios");
  const params = await searchParams;
  const text = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const result = await listUsersForModeration(viewer, 50, text);
  const users = result.ok ? result.value : [];
  const managesRoles = can(viewer, "roles:manage");

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-muted">{text ? `Contas com “${text}” no nome ou no e-mail.` : "Contas mais recentes e seus papéis."}</p>
      </header>

      <Form action="/admin/usuarios" className="flex gap-2" role="search">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
          Buscar por nome ou e-mail
          <input type="search" name="q" defaultValue={text} maxLength={80} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-normal" />
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          <Search aria-hidden className="size-4" /> Buscar
        </Button>
      </Form>

      {users.length === 0 ? (
        <p className="text-muted">Nenhuma conta encontrada.</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border" aria-label="Usuários">
            {users.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={u.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.displayName}</p>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {u.roles.length === 0 ? (
                      <Badge>Usuário</Badge>
                    ) : (
                      u.roles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "danger" : "brand"}>
                          {roleLabels[r]}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                {managesRoles && (
                  <details className="rounded-xl border border-border px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">Papéis de {u.displayName}</summary>
                    <div className="pt-3">
                      <TeamRolesForm userId={u.id} displayName={u.displayName} roles={u.roles} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
