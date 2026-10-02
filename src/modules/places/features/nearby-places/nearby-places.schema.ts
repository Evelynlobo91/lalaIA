import { z } from "zod";

// Área atendida (mesmos limites do mapa): Joinville e arredores.
export const SERVICE_AREA = { minLat: -26.9, maxLat: -25.8, minLon: -49.6, maxLon: -48.3 };

export const RADIUS_OPTIONS_M = [1000, 2000, 5000, 10000] as const;
export const DEFAULT_RADIUS_M = 2000;

/** Arredonda para 4 casas (~10 m): suficiente para distância, sem guardar a posição exata no histórico/links. */
export const roundCoordinate = (value: number) => Math.round(value * 10_000) / 10_000;

const coordinate = (min: number, max: number) =>
  z.coerce
    .number({ error: "Coordenada inválida." })
    .refine((v) => Number.isFinite(v), "Coordenada inválida.")
    .transform(roundCoordinate)
    .refine((v) => v >= min && v <= max, "Fora da área atendida (Joinville e arredores).");

export const nearbyPlacesSchema = z.object({
  lat: coordinate(SERVICE_AREA.minLat, SERVICE_AREA.maxLat),
  lon: coordinate(SERVICE_AREA.minLon, SERVICE_AREA.maxLon),
  radius: z.coerce
    .number()
    .int()
    .refine((v) => (RADIUS_OPTIONS_M as readonly number[]).includes(v), "Raio inválido.")
    .default(DEFAULT_RADIUS_M),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export type NearbyPlacesInput = z.infer<typeof nearbyPlacesSchema>;
