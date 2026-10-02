import { ImageResponse } from "next/og";
import { LOGO_COLORS, LOGO_PIN_PATH, LOGO_VIEWBOX, LOGO_WORDMARK_PATH } from "@/shared/ui";
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
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#3b1d8f", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, color: "#ffc94d" }}>
          <svg height="72" width="125" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
            <path d={LOGO_WORDMARK_PATH} fill="#ffffff" fillRule="evenodd" />
            <path d={LOGO_PIN_PATH} fill={LOGO_COLORS.red} fillRule="evenodd" />
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <svg width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="#ffc94d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
        <div style={{ display: "flex", fontSize: 32, color: "#ffc94d" }}>Desbloqueie essa experiência no LalaIA</div>
      </div>
    ),
    size,
  );
}
