// Pede a posição ao navegador SÓ no toque (consentimento explícito) e respeita o cookie `lalaia-geo` (#25).
// A posição vai arredondada (~10 m) direto para a Server Action e não é guardada no navegador nem no servidor.

export type LocationFix = { lat: number; lon: number; accuracy: number };
export type LocationProblem = "optedOut" | "denied" | "unavailable";

export const locationProblemMessages: Record<LocationProblem, string> = {
  optedOut: "Você desligou o uso da localização. Reative em Privacidade para fazer check-in.",
  denied: "Sem permissão para usar sua localização. Libere o acesso ao local no navegador e tente de novo.",
  unavailable: "Não foi possível descobrir sua localização agora. Ligue o GPS e tente de novo.",
};

const round = (v: number) => Math.round(v * 10_000) / 10_000;

export function requestLocation(): Promise<{ ok: true; fix: LocationFix } | { ok: false; problem: LocationProblem }> {
  if (/(?:^|;\s*)lalaia-geo=0(?:;|$)/.test(document.cookie)) return Promise.resolve({ ok: false, problem: "optedOut" });
  if (!("geolocation" in navigator)) return Promise.resolve({ ok: false, problem: "unavailable" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ ok: true, fix: { lat: round(coords.latitude), lon: round(coords.longitude), accuracy: Math.round(coords.accuracy) } }),
      (error) => resolve({ ok: false, problem: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      // Check-in precisa da posição de AGORA, com a melhor precisão disponível.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
