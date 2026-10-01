"use client";

import { LocateFixed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/shared/ui";
import { roundCoordinate } from "../nearby-places.schema";

type Status = "idle" | "locating" | "denied" | "unavailable";

const messages: Record<Exclude<Status, "idle" | "locating">, string> = {
  denied: "Sem permissão para usar sua localização.",
  unavailable: "Não foi possível descobrir sua localização agora.",
};

/** Pede a localização só quando a pessoa toca (consentimento explícito) e não grava nada. */
export function NearMeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  function locate() {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = roundCoordinate(coords.latitude);
        const lon = roundCoordinate(coords.longitude);
        router.push(`/lugares/perto?lat=${lat}&lon=${lon}`);
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onClick={locate} loading={status === "locating"}>
        <LocateFixed aria-hidden className="size-5" />
        Perto de mim
      </Button>
      {(status === "denied" || status === "unavailable") && (
        <p role="status" className="text-sm text-muted">
          {messages[status]}{" "}
          <Link href="/mapa" className="font-medium text-brand underline">
            Escolha um ponto no mapa
          </Link>
          .
        </p>
      )}
    </div>
  );
}
