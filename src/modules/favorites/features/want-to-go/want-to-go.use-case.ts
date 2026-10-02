import type { DomainEventPublisher } from "@/shared/events";
import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import "../../domain/events";
import type { FavoriteTargets } from "../../domain/favorite";
import type { WantToGoInput } from "./want-to-go.schema";

/**
 * "Quero ir": registra a intenção (métrica do promotor) publicando `favorites.WantToGoClicked`.
 * Funciona sem login (userId null). Só registra itens que existem, para não poluir a métrica.
 */
export class RecordWantToGo {
  constructor(
    private readonly targets: FavoriteTargets,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(userId: string | null, input: WantToGoInput): Promise<Result<null, NotFoundError>> {
    if (!(await this.targets[input.entityType].exists(input.entityId))) return err(new NotFoundError("Item"));
    await this.events.publish("favorites.WantToGoClicked", { userId, entityType: input.entityType, entityId: input.entityId });
    return ok(null);
  }
}
