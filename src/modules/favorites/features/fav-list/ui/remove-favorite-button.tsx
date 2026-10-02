"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import type { EntityType } from "../../../domain/favorite";
import type { FavToggleResult } from "../../fav-toggle/fav-toggle.use-case";
import { removeFavoriteAction } from "../fav-list.action";

/** "Remover" de um item da lista; a página se atualiza e o item some. */
export function RemoveFavoriteButton({ entityType, entityId, name }: { entityType: EntityType; entityId: string; name: string }) {
  const [state, action, pending] = useActionState<FormState<FavToggleResult>, FormData>(removeFavoriteAction, idleFormState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <Button type="submit" variant="ghost" size="sm" loading={pending} aria-label={`Remover ${name} dos favoritos`}>
        {!pending && <Trash2 aria-hidden className="size-4" />}
        Remover
      </Button>
      {state.status === "error" && (
        <p role="alert" className="max-w-56 text-right text-sm text-danger">
          {state.message ?? "Não foi possível remover. Tente de novo."}
        </p>
      )}
    </form>
  );
}
