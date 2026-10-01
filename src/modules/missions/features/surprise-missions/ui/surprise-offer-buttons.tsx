"use client";

import { useActionState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button } from "@/shared/ui";
import { respondSurpriseAction } from "../surprise-missions.actions";
import type { SurpriseResponse } from "../surprise-missions.use-case";

/** Aceitar ou ignorar a missão surpresa (POST). Ignorada, ela não volta a aparecer. */
export function SurpriseOfferButtons({ missionId, title }: { missionId: string; title: string }) {
  const [state, action, pending] = useActionState<FormState<SurpriseResponse>, FormData>(respondSurpriseAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="missionId" value={missionId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="accept" loading={pending} aria-label={`Aceitar a surpresa ${title}`}>
          Aceitar surpresa
        </Button>
        <Button type="submit" name="decision" value="dismiss" variant="secondary" disabled={pending} aria-label={`Ignorar a surpresa ${title}`}>
          Ignorar
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? "Não foi possível responder à missão surpresa."}
        </p>
      )}
    </form>
  );
}
