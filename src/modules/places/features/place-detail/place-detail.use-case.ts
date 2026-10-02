import { z } from "zod";
import { categories, type CategoryId } from "@/shared/catalog/categories";
import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import { describeOpeningHours, isOpenAt } from "../../domain/opening-hours";
import { directionsUrl, formatAddress, openStreetMapUrl, splitPhones, telHref, type PlaceDetailsReader } from "../../domain/place-details";

export type PlaceDetailView = {
  id: string;
  name: string;
  category: CategoryId;
  categoryLabel: string;
  address: string | null;
  neighborhood: string | null;
  phones: Array<{ label: string; href: string | null }>;
  website: string | null;
  openNow: boolean | null;
  weeklyHours: Array<{ day: string; hours: string }> | null;
  /** Horário bruto quando não conseguimos interpretar (mostrado como veio da fonte). */
  rawHours: string | null;
  directionsUrl: string;
  mapUrl: string;
  location: { lat: number; lon: number };
  fromOpenStreetMap: boolean;
};

const idSchema = z.uuid();
const labels = new Map<string, string>(categories.map((c) => [c.id, c.label]));

/** RF06/RF10 — Detalhe de um lugar com tudo o que estiver disponível. */
export class GetPlaceDetail {
  constructor(
    private readonly reader: PlaceDetailsReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(id: string): Promise<Result<PlaceDetailView, NotFoundError>> {
    // Id inválido nem chega ao banco: mesmo resultado de um lugar que não existe.
    if (!idSchema.safeParse(id).success) return err(new NotFoundError("Lugar"));
    const place = await this.reader.findById(id);
    if (!place) return err(new NotFoundError("Lugar"));

    const weeklyHours = describeOpeningHours(place.openingHours);
    return ok({
      id: place.id,
      name: place.name,
      category: place.category,
      categoryLabel: labels.get(place.category) ?? place.category,
      address: formatAddress(place.address),
      neighborhood: place.address.neighborhood,
      phones: place.phone ? splitPhones(place.phone).map((label) => ({ label, href: telHref(label) })) : [],
      website: place.website,
      openNow: isOpenAt(place.openingHours, this.now()),
      weeklyHours,
      rawHours: weeklyHours ? null : place.openingHours,
      directionsUrl: directionsUrl(place.location),
      mapUrl: openStreetMapUrl(place.location),
      location: place.location,
      fromOpenStreetMap: place.source === "osm",
    });
  }
}
