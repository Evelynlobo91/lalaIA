import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MyFavoritesView, favoritesTab, myFavorites } from "@/modules/favorites";
import { requireUser } from "@/modules/identity";

export const metadata: Metadata = { title: "Meus favoritos" };
// Depende da sessão e do momento (eventos que já terminaram).
export const dynamic = "force-dynamic";

export default async function FavoritosPage({ searchParams }: PageProps<"/perfil/favoritos">) {
  const user = await requireUser("/perfil/favoritos");
  const tab = favoritesTab(await searchParams);
  const favorites = await myFavorites(user);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/perfil" className="inline-flex items-center gap-1 self-start text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Perfil
      </Link>
      <h1 className="text-2xl font-bold md:text-3xl">Meus favoritos</h1>
      <MyFavoritesView favorites={favorites} tab={tab} />
    </div>
  );
}
