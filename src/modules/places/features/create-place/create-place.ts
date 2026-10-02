import { z } from "zod";
import { categoryIds, type CategoryId } from "@/shared/catalog/categories";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import { safeWebsite } from "../../domain/osm/osm-element";
import type { Coordinates } from "../../domain/place";

// Município de Joinville (os mesmos limites da importação do OpenStreetMap).
export const JOINVILLE_BOUNDS = { minLat: -26.6, maxLat: -26.0, minLon: -49.3, maxLon: -48.6 };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

/** Aceita vírgula decimal ("-26,3045"), como as pessoas digitam em português. */
const coordinate = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe a ${label}.`)
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => Number.isFinite(v), `${label[0].toUpperCase()}${label.slice(1)} inválida.`)
    .refine((v) => v >= min && v <= max, "Fora de Joinville.");

export const createPlaceSchema = z
  .object({
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
    lat: coordinate("latitude", JOINVILLE_BOUNDS.minLat, JOINVILLE_BOUNDS.maxLat),
    lon: coordinate("longitude", JOINVILLE_BOUNDS.minLon, JOINVILLE_BOUNDS.maxLon),
  })
  .transform(
    (input): NewAdminPlace => ({
      name: input.name,
      category: input.category,
      address: { street: input.street, houseNumber: input.houseNumber, neighborhood: input.neighborhood },
      phone: input.phone,
      website: input.website,
      location: { lat: input.lat, lon: input.lon },
    }),
  );

export type NewAdminPlace = {
  name: string;
  category: CategoryId;
  address: { street: string | null; houseNumber: string | null; neighborhood: string | null };
  phone: string | null;
  website: string | null;
  location: Coordinates;
};

export interface AdminPlaceCreator {
  /** Grava "como o admin" (RLS confere o papel de novo). Devolve o id do lugar. */
  createByAdmin(actorId: string, place: NewAdminPlace): Promise<string>;
}

/** Backoffice (#143): admin cadastra um estabelecimento direto, com origem "admin". */
export class CreatePlaceByAdmin {
  constructor(private readonly places: AdminPlaceCreator) {}

  async execute(admin: { id: string; isAdmin: boolean }, place: NewAdminPlace): Promise<Result<{ placeId: string }, DomainError>> {
    if (!admin.isAdmin) return err(new ForbiddenError("Só administradores cadastram estabelecimentos."));
    return ok({ placeId: await this.places.createByAdmin(admin.id, place) });
  }
}
