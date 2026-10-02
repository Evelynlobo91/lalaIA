import { placeSummary } from "@/modules/places";
import type { PlaceLookup } from "../domain/place-claim";

/** Adaptador: consulta lugares pela API pública do módulo places. */
export const placesLookup: PlaceLookup = { summary: placeSummary };
