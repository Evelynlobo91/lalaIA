export type ClaimStatus = "pending" | "approved" | "rejected";

export type PlaceClaim = {
  id: string;
  partnerId: string;
  placeId: string;
  status: ClaimStatus;
  rejectionReason: string | null;
  createdAt: Date;
};

/** Pedido com o que a tela precisa (nome do lugar e, na revisão, quem pediu). */
export type PlaceClaimView = PlaceClaim & { placeName: string; businessName: string; ownerId: string };

export interface PlaceClaimRepository {
  /** Cria (ou reenvia, se recusado) o pedido do parceiro para o lugar. */
  request(actorId: string, partnerId: string, placeId: string): Promise<PlaceClaim>;
  listMine(actorId: string, partnerId: string): Promise<PlaceClaim[]>;
  listForReview(actorId: string): Promise<Array<PlaceClaim & { businessName: string; ownerId: string }>>;
  review(actorId: string, claimId: string, decision: { status: "approved" } | { status: "rejected"; reason: string }): Promise<(PlaceClaim & { ownerId: string }) | null>;
}

/** Porta para consultar lugares (implementada pela API pública do módulo places). */
export interface PlaceLookup {
  summary(placeId: string): Promise<{ id: string; name: string; managed: boolean } | null>;
}
