import { Heart, Pencil, ShieldCheck, Store } from "lucide-react";
import type { Metadata } from "next";
import { LogoutButton, budgetOptions, groupSizes, hasRole, requireUser, userPreferences } from "@/modules/identity";
import { ActiveMissionsCard, myMissions } from "@/modules/missions";
import { XpCard, xpOverviewOf } from "@/modules/progression";
import { categories } from "@/shared/catalog/categories";
import { Avatar, Badge, ButtonLink, Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const user = await requireUser("/perfil");
  const [prefs, missions, xp] = await Promise.all([userPreferences().preferencesOf(user.id), myMissions(user.id), xpOverviewOf(user.id)]);

  const labels = prefs.categories.map((id) => categories.find((c) => c.id === id)?.label ?? id);
  const budget = prefs.budgetMax === null ? "Sem limite definido" : budgetOptions.find((b) => b.value === prefs.budgetMax)?.label;
  const group = groupSizes.find((g) => g.id === prefs.groupSize)?.label ?? "Depende";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Perfil</h1>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={user.displayName} src={user.avatarUrl} />
          <div className="min-w-0">
            <CardTitle className="truncate">{user.displayName}</CardTitle>
            <CardDescription className="truncate">{user.email}</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRole(user, "partner") && (
            <ButtonLink href="/parceiro" variant="secondary">
              <Store aria-hidden className="size-4" /> Portal do parceiro
            </ButtonLink>
          )}
          {hasRole(user, "admin") && (
            <ButtonLink href="/admin" variant="secondary">
              <ShieldCheck aria-hidden className="size-4" /> Moderação
            </ButtonLink>
          )}
          <ButtonLink href="/perfil/favoritos" variant="secondary">
            <Heart aria-hidden className="size-4" /> Meus favoritos
          </ButtonLink>
          <ButtonLink href="/perfil/editar" variant="secondary">
            <Pencil aria-hidden className="size-4" /> Editar perfil
          </ButtonLink>
          <LogoutButton />
        </div>
      </Card>

      <XpCard overview={xp} />

      <ActiveMissionsCard missions={missions} />

      <Card className="flex flex-col gap-3">
        <CardTitle>Suas preferências</CardTitle>
        {labels.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Categorias favoritas">
            {labels.map((l) => (
              <li key={l}>
                <Badge variant="brand">{l}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <CardDescription>Você ainda não escolheu do que gosta. Edite o perfil para receber recomendações melhores.</CardDescription>
        )}
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Orçamento</dt>
            <dd className="font-medium">{budget}</dd>
          </div>
          <div>
            <dt className="text-muted">Distância</dt>
            <dd className="font-medium">Até {prefs.radiusKm} km</dd>
          </div>
          <div>
            <dt className="text-muted">Costuma sair</dt>
            <dd className="font-medium">{group}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
