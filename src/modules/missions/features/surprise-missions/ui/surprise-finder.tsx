"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { idleFormState, type FormState } from "@/shared/http/form-state";
import { Button, FormAlert } from "@/shared/ui";
import { locationProblemMessages, requestLocation, type LocationProblem } from "../../geofence-validation/ui/request-location";
import { findSurpriseAction } from "../surprise-missions.actions";
import type { SurpriseTeaser } from "../surprise-missions.use-case";

/**
 * "Procurar missão surpresa por perto": pede a localização só no toque (respeita `lalaia-geo`) e envia por POST.
 * Se houver uma surpresa perto, ela aparece na lista de ofertas da página (com validade curta).
 */
export function SurpriseFinder() {
  const [state, dispatch, pending] = useActionState<FormState<SurpriseTeaser | null>, FormData>(findSurpriseAction, idleFormState);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  const [locating, setLocating] = useState(false);

  async function find() {
    setProblem(null);
    setLocating(true);
    const location = await requestLocation();
    setLocating(false);
    if (!location.ok) {
      setProblem(location.problem);
      return;
    }
    const data = new FormData();
    data.set("lat", String(location.fix.lat));
    data.set("lon", String(location.fix.lon));
    startTransition(() => dispatch(data));
  }

  const error = state.status === "error" ? (state.message ?? Object.values(state.fieldErrors ?? {}).flat()[0] ?? "Não foi possível procurar agora.") : null;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onClick={find} loading={locating || pending}>
        <Sparkles aria-hidden className="size-5" /> Procurar missão surpresa por perto
      </Button>
      {state.status === "success" && !state.data && (
        <p role="status" className="text-sm text-muted">
          Nenhuma missão surpresa por perto agora. Explore outro canto da cidade e procure de novo!
        </p>
      )}
      {state.status === "success" && state.data && <FormAlert variant="success">Surpresa! Uma missão apareceu perto de você.</FormAlert>}
      {error && <FormAlert>{error}</FormAlert>}
      {problem && (
        <p role="status" className="text-sm text-muted">
          {locationProblemMessages[problem].replace(" para fazer check-in", "")}{" "}
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
