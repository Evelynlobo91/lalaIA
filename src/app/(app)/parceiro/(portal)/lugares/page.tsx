import { ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClaimButton, myPlaceClaims, requirePartner } from "@/modules/partners";
import { placesManagedBy, searchPlacesByName } from "@/modules/places";
import { Badge, Button, Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Meus lugares · Portal do parceiro" };

const statusLabel = { pending: "Em análise", approved: "Aprovado", rejected: "Recusado" } as const;

export default async function MeusLugaresPage({ searchParams }: PageProps<"/parceiro/lugares">) {
  const session = await requirePartner("/parceiro/lugares");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 80) : "";

  const [mine, claims, results] = await Promise.all([placesManagedBy(session.user.id), myPlaceClaims(session), searchPlacesByName(query)]);
  const openClaims = claims.filter((c) => c.status !== "approved");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="meus-lugares">
        <h1 id="meus-lugares" className="text-2xl font-bold">
          Meus lugares
        </h1>
        {mine.length === 0 ? (
          <p className="text-muted">Você ainda não administra nenhum lugar. Encontre o seu abaixo e toque em &ldquo;É meu&rdquo;.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Lugares que você administra">
            {mine.map((p) => (
              <li key={p.id}>
                <Link href={`/parceiro/lugares/${p.id}/editar`} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
                  <Card as="div" className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription>
                        {p.categoryLabel}
                        {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                      </CardDescription>
                    </div>
                    <span className="text-sm font-medium text-brand">Editar</span>
                    <ChevronRight aria-hidden className="size-5 text-muted" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openClaims.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="pedidos">
          <h2 id="pedidos" className="text-lg font-semibold">
            Pedidos de vínculo
          </h2>
          <ul className="flex flex-col gap-2" aria-label="Seus pedidos de vínculo">
            {openClaims.map((c) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.placeName}</span>
                    <Badge variant={c.status === "rejected" ? "danger" : "neutral"}>{statusLabel[c.status]}</Badge>
                  </div>
                  {c.rejectionReason && <p className="text-sm text-muted">Motivo: {c.rejectionReason}</p>}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="reivindicar">
        <h2 id="reivindicar" className="text-lg font-semibold">
          Reivindicar um lugar
        </h2>
        <form className="flex gap-2" role="search">
          <label htmlFor="busca-lugar" className="sr-only">
            Nome do lugar
          </label>
          <input id="busca-lugar" name="q" defaultValue={query} placeholder="Nome do seu estabelecimento" className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4" />
          <Button type="submit" variant="secondary">
            <Search aria-hidden className="size-4" /> Buscar
          </Button>
        </form>
        {query.length >= 2 && results.length === 0 && <p className="text-muted">Nenhum lugar com esse nome.</p>}
        {results.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Resultados da busca">
            {results.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-sm text-muted">
                      {p.categoryLabel}
                      {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                    </p>
                  </div>
                  {p.managed ? <span className="shrink-0 text-sm text-muted">Já tem responsável</span> : <ClaimButton placeId={p.id} placeName={p.name} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
