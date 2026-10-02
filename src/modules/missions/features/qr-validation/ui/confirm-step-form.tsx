"use client";

import { QrCode } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { locationProblemMessages, requestLocation } from "../../geofence-validation/ui/request-location";
import { completeStepAction } from "../qr-validation.action";
import type { StepCompleted } from "../complete-step.use-case";

/**
 * Confirmação da etapa: um toque (POST) depois de abrir o link do QR. GET nunca altera dados.
 * `needsLocation` (etapa "QR + GPS", #61): pede a localização no mesmo toque e a envia junto.
 */
export function ConfirmStepForm({ token, needsLocation = false }: { token: string; needsLocation?: boolean }) {
  const [state, action, pending] = useActionState<FormState<StepCompleted>, FormData>(completeStepAction, idleFormState);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    if (!needsLocation) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLocationError(null);
    setLocating(true);
    const location = await requestLocation();
    setLocating(false);
    if (!location.ok) {
      setLocationError(locationProblemMessages[location.problem]);
      return;
    }
    data.set("lat", String(location.fix.lat));
    data.set("lon", String(location.fix.lon));
    data.set("accuracy", String(location.fix.accuracy));
    startTransition(() => action(data));
  }

  const message = state.status === "error" ? (state.message ?? state.fieldErrors?.token?.[0] ?? "Não foi possível validar a etapa.") : null;
  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {message && <FormAlert>{message}</FormAlert>}
      {locationError && <FormAlert>{locationError}</FormAlert>}
      {needsLocation && <p className="text-sm text-muted">Esta etapa também confere se você está no lugar: vamos pedir sua localização ao concluir. Ela não é guardada.</p>}
      <Button type="submit" size="lg" loading={pending || locating} className="self-start">
        <QrCode aria-hidden className="size-5" /> Concluir etapa
      </Button>
    </form>
  );
}
