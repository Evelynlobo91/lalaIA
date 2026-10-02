import { ValidationError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { allowedLink, type CtaType } from "../../domain/cta";
import type { StreamTarget } from "../../domain/stream";

export type CtaOption = { id: string; label: string };

/**
 * O que os tipos de CTA precisam dos outros módulos (implementado pelas APIs públicas de partners, missions,
 * events e places). Só devolve o que é do próprio parceiro e ainda está valendo.
 */
export interface CtaCatalog {
  /** Ofertas vigentes ou agendadas do parceiro, com a página onde são resgatadas. */
  offers(ownerId: string): Promise<Array<CtaOption & { href: string }>>;
  /** Missões ativas do parceiro. */
  missions(ownerId: string): Promise<CtaOption[]>;
  /** Eventos do parceiro que ainda não terminaram. */
  events(ownerId: string): Promise<CtaOption[]>;
  /** Rota no app de mapas até o lugar transmitido (ou o lugar do evento); null se não houver coordenadas. */
  directions(target: StreamTarget): Promise<string | null>;
}

export type CtaDestination = { refId: string | null; href: string; external: boolean };
export type CtaReference = { refId: string | null; url: string | null };

/**
 * Um tipo de CTA (estratégia): diz que campo o formulário pede, que opções oferece e para onde o toque leva.
 * Tipo novo = implementação nova nesta lista, sem `if` nos casos de uso.
 */
export interface CtaTypeHandler {
  readonly type: CtaType;
  /** Campo extra do formulário: uma escolha (oferta, missão, evento), um endereço ou nada. */
  readonly field: "ref" | "url" | "none";
  readonly defaultButton: string;
  options(ownerId: string): Promise<CtaOption[]>;
  /** Valida a referência e resolve o destino do toque. */
  resolve(ownerId: string, target: StreamTarget, reference: CtaReference): Promise<Result<CtaDestination, DomainError>>;
}

const invalid = (path: "refId" | "url", message: string) => err(new ValidationError("CTA inválido.", [{ path: [path], message }]));

function chosen<T extends CtaOption>(
  type: CtaType,
  defaultButton: string,
  list: (ownerId: string) => Promise<T[]>,
  hrefOf: (option: T) => string,
  missing: string,
): CtaTypeHandler {
  return {
    type,
    field: "ref",
    defaultButton,
    options: async (ownerId) => (await list(ownerId)).map(({ id, label }) => ({ id, label })),
    async resolve(ownerId, _target, { refId }) {
      const option = refId ? (await list(ownerId)).find((o) => o.id === refId) : undefined;
      return option ? ok({ refId: option.id, href: hrefOf(option), external: false }) : invalid("refId", missing);
    },
  };
}

/** Os tipos disponíveis. `linkDomains`: domínios aceitos no tipo link. */
export function ctaTypeHandlers(catalog: CtaCatalog, linkDomains: readonly string[]): Record<CtaType, CtaTypeHandler> {
  return {
    promocao: chosen("promocao", "Ver oferta", (o) => catalog.offers(o), (offer) => offer.href, "Escolha uma oferta sua que esteja valendo ou agendada."),
    missao: chosen("missao", "Aceitar missão", (o) => catalog.missions(o), (m) => `/missoes/${m.id}`, "Escolha uma missão sua que esteja ativa."),
    evento: chosen("evento", "Ver evento", (o) => catalog.events(o), (e) => `/eventos/${e.id}`, "Escolha um evento seu que ainda não terminou."),
    "quero-ir": {
      type: "quero-ir",
      field: "none",
      defaultButton: "Quero ir",
      options: async () => [],
      async resolve(_ownerId, target) {
        const href = await catalog.directions(target);
        return href ? ok({ refId: null, href, external: true }) : err(new ValidationError("CTA inválido.", [{ path: ["type"], message: "Este lugar ainda não tem localização no mapa." }]));
      },
    },
    link: {
      type: "link",
      field: "url",
      defaultButton: "Abrir",
      options: async () => [],
      async resolve(_ownerId, _target, { url }) {
        const href = url ? allowedLink(url, linkDomains) : null;
        return href ? ok({ refId: null, href, external: true }) : invalid("url", `Use um endereço https de: ${linkDomains.join(", ")}.`);
      },
    },
  };
}
