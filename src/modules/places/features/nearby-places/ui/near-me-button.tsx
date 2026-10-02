"use client";

import { LocateFixed } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/shared/ui";
// Sem o schema (zod) no navegador: só a função de arredondar.
import { roundCoordinate } from "../coordinates";

type Status = "idle" | "locating" | "denied" | "unavailable" | "optedOut";

const messages: Record<Exclude<Status, "idle" | "locating" | "optedOut">, string> = {
  denied: "Sem permissão para usar sua localização.",
  unavailable: "Não foi possível descobrir sua localização agora.",
};

/**
 * Pede a localização só quando a pessoa toca (consentimento explícito) e não grava nada.
 * `target`: para onde ir com `lat`/`lon` (padrão: lugares perto). Pode já ter outros parâmetros.
 */
export function NearMeButton({ target = "/lugares/perto", label = "Perto de mim" }: { target?: string; label?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");

  function locate() {
    // Consentimento (#25): localização desligada em Privacidade → nem pede o GPS.
    if (/(?:^|;\s*)lalaia-geo=0(?:;|$)/.test(document.cookie)) {
      setStatus("optedOut");
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = roundCoordinate(coords.latitude);
        const lon = roundCoordinate(coords.longitude);
        router.push(`${target}${target.includes("?") ? "&" : "?"}lat=${lat}&lon=${lon}`);
      },
      (error) => setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onClick={locate} loading={status === "locating"}>
        <LocateFixed aria-hidden className="size-5" />
        {label}
      </Button>
      {status === "optedOut" && (
        <p role="status" className="text-sm text-muted">
          Você desligou o uso da localização.{" "}
          <Link href="/perfil/privacidade" className="font-medium text-brand underline">
            Reativar em Privacidade
          </Link>{" "}
          ou{" "}
          <Link href="/mapa" className="font-medium text-brand underline">
            escolha um ponto no mapa
          </Link>
          .
        </p>
      )}
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
