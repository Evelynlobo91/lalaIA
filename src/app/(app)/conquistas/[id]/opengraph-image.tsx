import { ImageResponse } from "next/og";
import { sharedAchievementOf } from "@/modules/progression";

// Imagem gerada da conquista (#70), na identidade do LalaIA, para o post no Instagram/WhatsApp.
export const alt = "Conquista desbloqueada no LalaIA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shared = await sharedAchievementOf(id);
  const title = shared?.title ?? "Explore Joinville";
  const who = shared ? `${shared.firstName ?? "Alguém"} desbloqueou` : "Conquistas no LalaIA";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#1d51cb", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, color: "#ffe3e3" }}>
          <svg width="64" height="64" viewBox="0 0 512 512">
            <path d="M256 92c-70 0-126 55-126 124 0 92 126 204 126 204s126-112 126-204c0-69-56-124-126-124z" fill="#ffe3e3" />
            <path d="M256 150l17 44 46 3-36 29 12 45-39-25-39 25 12-45-36-29 46-3z" fill="#1d51cb" />
          </svg>
          LalaIA
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="#ffe3e3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 36, opacity: 0.9 }}>{who}</div>
            <div style={{ fontSize: title.length > 26 ? 64 : 80, lineHeight: 1.05 }}>{title}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#ffe3e3" }}>Desbloqueie essa experiência no LalaIA</div>
      </div>
    ),
    size,
  );
}
