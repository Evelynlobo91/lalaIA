"use client";

import { LocateFixed } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { geofenceCheckInAction } from "../geofence-validation.action";
import type { GeofenceCheckInResult } from "../geofence-validation.use-case";
import { locationProblemMessages, requestLocation, type LocationProblem } from "./request-location";

/**
 * "Fazer check-in" de uma etapa por GPS: pede a localização no toque e envia por POST (Server Action).
 * Se faltar a permanência mínima, mostra quanto tempo esperar; tocar de novo depois conclui a etapa.
 */
export function GeofenceCheckInButton({ stepId, radiusMeters }: { stepId: string; radiusMeters: number }) {
  const [state, dispatch, pending] = useActionState<FormState<GeofenceCheckInResult>, FormData>(geofenceCheckInAction, idleFormState);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [locating, setLocating] = useState(false);

  async function checkIn() {
    setProblem(null);
    setLocating(true);
    const location = await requestLocation();
    setLocating(false);
    if (!location.ok) {
      setProblem(location.problem);
      return;
    }
    const data = new FormData();
    data.set("stepId", stepId);
    data.set("lat", String(location.fix.lat));
    data.set("lon", String(location.fix.lon));
    data.set("accuracy", String(location.fix.accuracy));
    startTransition(() => dispatch(data));
  }

  const errorMessage =
    state.status === "error" ? (state.message ?? Object.values(state.fieldErrors ?? {}).flat()[0] ?? "Não foi possível fazer o check-in.") : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={checkIn} loading={locating || pending}>
        <LocateFixed aria-hidden className="size-5" /> Fazer check-in
      </Button>
      <p className="text-sm text-muted">Esteja a menos de {radiusMeters} m do lugar. Sua localização é usada só agora e não é guardada.</p>
      {state.status === "success" && state.data.status === "dwell" && <FormAlert variant="success">{dwellMessage(state.data.minutesLeft)}</FormAlert>}
      {errorMessage && <FormAlert>{errorMessage}</FormAlert>}
      {problem && (
        <p role="status" className="text-sm text-muted">
          {locationProblemMessages[problem]}{" "}
          {problem === "optedOut" && (
            <Link href="/perfil/privacidade" className="font-medium text-brand underline">
              Abrir Privacidade
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

const dwellMessage = (minutes: number) =>
  `Você chegou! Fique por perto e faça o check-in de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"} para concluir a etapa.`;
