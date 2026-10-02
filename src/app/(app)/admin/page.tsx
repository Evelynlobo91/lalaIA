import type { Metadata } from "next";
import { listUsersForModeration, requireRole } from "@/modules/identity";
import { Avatar, Badge, Card } from "@/shared/ui";

export const metadata: Metadata = { title: "Moderação", robots: { index: false } };

const roleLabels = { partner: "Parceiro", admin: "Admin" } as const;

export default async function AdminPage() {
  const admin = await requireRole("admin", "/admin");
  const result = await listUsersForModeration(admin);
  const users = result.ok ? result.value : [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Moderação</h1>
        <p className="text-muted">Contas mais recentes e seus papéis.</p>
      </header>

      <Card className="p-0">
        <ul className="divide-y divide-border" aria-label="Usuários">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.displayName}</p>
                <p className="truncate text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {u.roles.length === 0 ? <Badge>Usuário</Badge> : u.roles.map((r) => <Badge key={r} variant={r === "admin" ? "danger" : "brand"}>{roleLabels[r]}</Badge>)}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
