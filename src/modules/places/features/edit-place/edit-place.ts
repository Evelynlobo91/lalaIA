import { z } from "zod";
import { categoryIds } from "@/shared/catalog/categories";
import type { DomainEventPublisher } from "@/shared/events";
import { ForbiddenError, NotFoundError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import "../../domain/events";
import { safeWebsite } from "../../domain/osm/osm-element";
import type { EditablePlace, PlaceOwnershipRepository } from "../../domain/place-ownership";
import { osmFromSchedule, type WeeklySchedule } from "../../domain/weekly-schedule";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

// Dias chegam do formulário como day0_open, day0_from, day0_to ... day6_*.
const dayFields = Object.fromEntries(
  Array.from({ length: 7 }, (_, i) => [
    [`day${i}_open`, z.literal("on").optional()],
    [`day${i}_from`, time],
    [`day${i}_to`, time],
  ]).flat(),
) as Record<string, z.ZodType>;

export const editPlaceSchema = z
  .object({
    placeId: z.uuid(),
    name: z.string().trim().min(2, "Informe o nome.").max(200),
    category: z.enum(categoryIds, { error: "Escolha uma categoria." }),
    street: optionalText(200),
    houseNumber: optionalText(20),
    neighborhood: optionalText(120),
    phone: optionalText(60),
    website: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (!v) return null;
        const safe = safeWebsite(v);
        if (!safe) ctx.addIssue({ code: "custom", message: "Informe um site válido (http ou https)." });
        return safe;
      }),
    ...dayFields,
  })
  .transform((input) => {
    const schedule: WeeklySchedule = Array.from({ length: 7 }, (_, i) => {
      const record = input as Record<string, string | undefined>;
      return { open: record[`day${i}_open`] === "on", from: record[`day${i}_from`]!, to: record[`day${i}_to`]! };
    });
    return {
      placeId: input.placeId,
      edit: {
        name: input.name,
        category: input.category,
        address: { street: input.street, houseNumber: input.houseNumber, neighborhood: input.neighborhood },
        phone: input.phone,
        website: input.website,
        openingHours: osmFromSchedule(schedule),
      },
    };
  });

export type EditPlaceInput = z.infer<typeof editPlaceSchema>;
export type Editor = { id: string; isAdmin: boolean };

/** Lugar para o formulário de edição; só o dono (ou admin) recebe. */
export async function placeForEdit(repo: PlaceOwnershipRepository, editor: Editor, placeId: string): Promise<EditablePlace | null> {
  if (!z.uuid().safeParse(placeId).success) return null;
  const place = await repo.findEditable(placeId);
  if (!place || (place.managedBy !== editor.id && !editor.isAdmin)) return null;
  return place;
}

/** RF10 — O dono atualiza os dados do lugar (protegido contra reimportação do OSM). */
export class EditOwnedPlace {
  constructor(
    private readonly repo: PlaceOwnershipRepository,
    private readonly events?: DomainEventPublisher,
  ) {}

  async execute(editor: Editor, input: EditPlaceInput): Promise<Result<{ placeId: string }, DomainError>> {
    const place = await this.repo.findEditable(input.placeId);
    if (!place) return err(new NotFoundError("Lugar"));
    if (place.managedBy !== editor.id && !editor.isAdmin) return err(new ForbiddenError("Só o responsável pelo lugar pode editar."));
    // RLS confere de novo no banco (asUser): sem ser dono/admin, nenhuma linha é alterada.
    if (!(await this.repo.update(editor.id, place.id, input.edit))) return err(new ForbiddenError("Só o responsável pelo lugar pode editar."));
    // Auditoria (#146): só quando o admin mexe num lugar que não é dele.
    if (place.managedBy !== editor.id) await this.events?.publish("places.PlaceEditedByAdmin", { placeId: place.id, editedBy: editor.id });
    return ok({ placeId: place.id });
  }
}

/** Reage à aprovação de uma reivindicação (evento do módulo partners): marca o dono do lugar. */
export class AssignPlaceOwner {
  constructor(private readonly repo: PlaceOwnershipRepository) {}

  async execute(placeId: string, userId: string): Promise<void> {
    await this.repo.assignOwner(placeId, userId);
  }
}
