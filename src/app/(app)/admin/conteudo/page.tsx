import type { Metadata } from "next";
import Link from "next/link";
import { ContentSearch, contentQuery } from "@/modules/backoffice";
import { eventsForAdmin } from "@/modules/events";
import { can, requireCapability } from "@/modules/identity";
import { missionsForAdmin } from "@/modules/missions";
import { searchPlacesByName } from "@/modules/places";
import { formatDateTime } from "@/shared/time/joinville-time";
import { Badge, ButtonLink, Card, FormAlert } from "@/shared/ui";

export const metadata: Metadata = { title: "Conteúdo · Backoffice", robots: { index: false } };
// Lista de trabalho do admin: sempre os dados de agora.
export const dynamic = "force-dynamic";

const PLACES_LIMIT = 50;

type Row = { id: string; title: string; detail: string; badge: { label: string; variant: "success" | "neutral" | "danger" }; editHref: string | null; publicHref: string | null };

async function rows(tab: "lugares" | "eventos" | "missoes", text: string, viewer: { isAdmin: boolean }): Promise<Row[]> {
  const now = new Date();
  if (tab === "lugares") {
    const places = await searchPlacesByName(text, PLACES_LIMIT);
    return places.map((p) => ({
      id: p.id,
      title: p.name,
      detail: [p.categoryLabel, p.neighborhood].filter(Boolean).join(" · "),
      badge: p.managed ? { label: "Com responsável", variant: "success" } : { label: "Sem responsável", variant: "neutral" },
      editHref: `/admin/conteudo/lugares/${p.id}/editar`,
      publicHref: `/lugares/${p.id}`,
    }));
  }
  if (tab === "eventos") {
    const result = await eventsForAdmin(viewer, text);
    return (result.ok ? result.value : []).map((e) => {
      const finished = e.endsAt < now;
      const editable = e.status === "scheduled" && !finished;
      return {
        id: e.id,
        title: e.title,
        detail: formatDateTime(e.startsAt),
        badge: e.status === "cancelled" ? { label: "Cancelado", variant: "danger" } : finished ? { label: "Encerrado", variant: "neutral" } : { label: "Agendado", variant: "success" },
        editHref: editable ? `/admin/conteudo/eventos/${e.id}/editar` : null,
        publicHref: `/eventos/${e.id}`,
      };
    });
  }
  const result = await missionsForAdmin(viewer, text);
  return (result.ok ? result.value : []).map((m) => ({
    id: m.id,
    title: m.title,
    detail: `${formatDateTime(m.startsAt)} até ${formatDateTime(m.endsAt)}${m.surprise ? " · surpresa" : ""}`,
    badge: m.status === "archived" ? { label: "Encerrada", variant: "neutral" } : { label: "Ativa", variant: "success" },
    editHref: m.status === "active" ? `/admin/conteudo/missoes/${m.id}/editar` : null,
    publicHref: m.surprise ? null : `/missoes/${m.id}`,
  }));
}

const labels = { lugares: "Lugares", eventos: "Eventos", missoes: "Missões" } as const;

export default async function AdminConteudoPage({ searchParams }: PageProps<"/admin/conteudo">) {
  const admin = await requireCapability("content:edit", "/admin/conteudo");
  const params = await searchParams;
  const { tab, text } = contentQuery(params);
  const needsText = tab === "lugares" && text.length < 2;
  const items = needsText ? [] : await rows(tab, text, { isAdmin: can(admin, "content:edit") });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Conteúdo</h1>
        <p className="text-muted">Encontre e corrija qualquer estabelecimento, evento ou missão da plataforma.</p>
      </header>

      {typeof params.salvo === "string" && (
        <FormAlert variant="success">Alterações salvas.</FormAlert>
      )}

      <ContentSearch tab={tab} text={text} />

      <Link href="/admin/conteudo/chamadas" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-brand underline">
        Chamadas nas lives
      </Link>

      {tab === "lugares" && (
        <ButtonLink href="/admin/conteudo/lugares/novo" variant="secondary" className="self-start">
          Cadastrar estabelecimento
        </ButtonLink>
      )}

      {needsText ? (
        <p className="text-muted">Digite pelo menos 2 letras do nome do lugar para buscar.</p>
      ) : items.length === 0 ? (
        <p className="text-muted">Nada encontrado{text ? ` para “${text}”` : ""}.</p>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border" aria-label={labels[tab]}>
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="truncate text-sm text-muted">{item.detail}</p>
                </div>
                <Badge variant={item.badge.variant}>{item.badge.label}</Badge>
                <div className="flex gap-3 text-sm font-medium">
                  {item.publicHref && (
                    <Link href={item.publicHref} prefetch={false} className="inline-flex min-h-11 items-center text-muted underline hover:text-fg" aria-label={`Ver ${item.title}`}>
                      Ver
                    </Link>
                  )}
                  {item.editHref && (
                    <Link href={item.editHref} prefetch={false} className="inline-flex min-h-11 items-center text-brand underline" aria-label={`Editar ${item.title}`}>
                      Editar
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
