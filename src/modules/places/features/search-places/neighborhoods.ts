/** Bairro com lugares cadastrados (opção do filtro de localização). */
export type Neighborhood = { name: string; places: number };

export interface PlaceNeighborhoods {
  /** Bairros com pelo menos um lugar, em ordem alfabética (grafias diferentes do mesmo bairro juntas). */
  neighborhoods(): Promise<Neighborhood[]>;
  /** Ids dos lugares de um bairro (para outros módulos filtrarem pelo lugar, sem join entre schemas). */
  placeIdsIn(neighborhood: string): Promise<string[]>;
}
