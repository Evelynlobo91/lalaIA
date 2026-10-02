import { ImageResponse } from "next/og";
import { getEventDetail } from "@/modules/events";

// Card de compartilhamento do evento (Instagram, WhatsApp...) na identidade do LalaIA.
export const alt = "Evento em Joinville no LalaIA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventDetail(id);
  const title = event?.title ?? "O que fazer em Joinville";
  const when = event ? event.whenLabel : "Descubra o que está acontecendo agora";
  const where = event?.place?.name ?? "";

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
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: title.length > 40 ? 62 : 80, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 38, opacity: 0.92 }}>{when}</div>
          {where && <div style={{ fontSize: 34, color: "#ffe3e3" }}>{where}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#ffe3e3" }}>Descobrir → Ver → Decidir → Viver</div>
      </div>
    ),
    size,
  );
}
