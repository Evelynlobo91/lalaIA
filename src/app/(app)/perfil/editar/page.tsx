import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AvatarForm, EditProfileForm, PreferencesForm, requireUser, userPreferences } from "@/modules/identity";
import { Card, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Editar perfil" };

export default async function EditarPerfilPage() {
  const user = await requireUser("/perfil/editar");
  const preferences = await userPreferences().preferencesOf(user.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/perfil" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Voltar ao perfil
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">Editar perfil</h1>

      <Card className="flex flex-col gap-4">
        <CardTitle>Foto</CardTitle>
        <AvatarForm name={user.displayName} avatarUrl={user.avatarUrl} />
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Seus dados</CardTitle>
        <EditProfileForm displayName={user.displayName} email={user.email} />
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Preferências</CardTitle>
          <p className="text-sm text-muted">Usamos isso para sugerir o que combina com você agora.</p>
        </div>
        <PreferencesForm preferences={preferences} />
      </Card>
    </div>
  );
}
