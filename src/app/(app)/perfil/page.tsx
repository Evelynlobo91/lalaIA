import type { Metadata } from "next";
import { LogoutButton, requireUser } from "@/modules/identity";
import { Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const user = await requireUser("/perfil");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Perfil</h1>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-brand-fg">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
          <div>
            <CardTitle>{user.displayName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
        </div>
        <LogoutButton />
      </Card>

      <p className="text-sm text-muted">Em breve: suas preferências, favoritos, missões e tudo o que você já descobriu em Joinville.</p>
    </div>
  );
}
