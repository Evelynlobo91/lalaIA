import type { CategoryId } from "@/shared/catalog/categories";
import type { Address, Coordinates } from "./place";

export type PlaceDetails = {
  id: string;
  name: string;
  category: CategoryId;
  address: Address;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  location: Coordinates;
  source: "osm" | "partner";
};

export interface PlaceDetailsReader {
  findById(id: string): Promise<PlaceDetails | null>;
}

/** "Rua Coelho Neto, 268 - Santo Antônio, Joinville - SC" (só com as partes existentes). */
export function formatAddress(address: Address): string | null {
  const street = [address.street, address.houseNumber].filter(Boolean).join(", ");
  const local = [street, address.neighborhood].filter(Boolean).join(" - ");
  return local ? `${local}, ${address.city} - SC` : null;
}

/**
 * Rota até o lugar. URL universal do Google Maps: abre o app de mapas instalado no celular
 * (ou o site no computador), sem chave de API e sem custo.
 */
export function directionsUrl({ lat, lon }: Coordinates): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Link para o lugar no OpenStreetMap (fonte dos dados, também usado para corrigir informações). */
export function openStreetMapUrl({ lat, lon }: Coordinates): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=18/${lat.toFixed(6)}/${lon.toFixed(6)}`;
}

/** Separa campos com vários telefones ("47 3433-0000; 47 99999-0000"). */
export function splitPhones(value: string): string[] {
  return value
    .split(/[;/]|\s+ou\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);
}

/** Só dígitos e "+" para o link tel: (o texto exibido continua o original). */
export function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? `tel:${digits}` : null;
}
