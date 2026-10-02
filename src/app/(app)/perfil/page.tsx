import { Heart, Lock, Map as MapIcon, Pencil, ShieldCheck, Store, Target, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton, budgetOptions, groupSizes, hasRole, requireUser, userPreferences } from "@/modules/identity";
import { ActiveMissionsCard, myMissions } from "@/modules/missions";
import { MyRedemptionsCard, myRedemptions } from "@/modules/partners";
import { AchievementsCard, ExplorerProfileCard, LevelCard, XpCard, achievementsOf, explorerProfileOf, levelOverviewOf, xpOverviewOf } from "@/modules/progression";
import { categories } from "@/shared/catalog/categories";
import { Avatar, Badge, ButtonLink, Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const user = await requireUser("/perfil");
  const [prefs, missions, xp, level, achievements, explorer, redemptions] = await Promise.all([
    userPreferences().preferencesOf(user.id),
    myMissions(user.id),
    xpOverviewOf(user.id),
    levelOverviewOf(user.id),
    achievementsOf(user.id),
    explorerProfileOf(user.id),
    myRedemptions(user.id),
  ]);

  const labels = prefs.categories.map((id) => categories.find((c) => c.id === id)?.label ?? id);
  const budget = prefs.budgetMax === null ? "Sem limite definido" : budgetOptions.find((b) => b.value === prefs.budgetMax)?.label;
  const group = groupSizes.find((g) => g.id === prefs.groupSize)?.label ?? "Depende";
  const shortcuts: Array<{ href: string; label: string; icon: LucideIcon }> = [
    { href: "/perfil/mapa", label: "Meu mapa", icon: MapIcon },
    { href: "/missoes", label: "Missões", icon: Target },
    { href: "/perfil/favoritos", label: "Meus favoritos", icon: Heart },
    { href: "/perfil/privacidade", label: "Privacidade e dados", icon: Lock },
    ...(hasRole(user, "partner") ? [{ href: "/parceiro", label: "Portal do parceiro", icon: Store }] : []),
    ...(hasRole(user, "admin") ? [{ href: "/admin", label: "Moderação", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold md:text-3xl">Meu perfil</h1>

      <Card className="flex flex-col items-center gap-3 overflow-hidden p-0 pb-5 text-center">
        {/* Capa azul (no protótipo, ilustração da cidade) com a foto sobreposta. */}
        <div
          aria-hidden
          className="h-24 w-full bg-brand [background-image:radial-gradient(circle_at_85%_20%,rgb(255_50_50/0.45),transparent_40%),radial-gradient(circle_at_10%_100%,rgb(255_255_255/0.2),transparent_45%)]"
        />
        <Avatar name={user.displayName} src={user.avatarUrl} size="lg" className="-mt-16 ring-4 ring-surface" />
        <div className="flex min-w-0 max-w-full flex-col gap-0.5 px-4">
          <CardTitle className="truncate text-xl">{user.displayName}</CardTitle>
          <CardDescription className="truncate">{user.email}</CardDescription>
        </div>
        <Badge variant="brand">
          Nível {level.level} · {level.name}
        </Badge>
        <ButtonLink href="/perfil/editar" variant="secondary" size="sm">
          <Pencil aria-hidden className="size-4" /> Editar perfil
        </ButtonLink>
      </Card>

      <nav aria-label="Atalhos do perfil">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface p-2 text-center text-xs font-semibold shadow-sm transition hover:border-brand"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-brand">
                  <Icon aria-hidden className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="self-center">
        <LogoutButton />
      </div>

      <LevelCard overview={level} />

      <ExplorerProfileCard profile={explorer} />

      <XpCard overview={xp} />

      <AchievementsCard overview={achievements} />

      <ActiveMissionsCard missions={missions} />

      <MyRedemptionsCard items={redemptions} />

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
