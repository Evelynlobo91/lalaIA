import { ImageResponse } from "next/og";
import { LOGO_COLORS, LOGO_PIN_PATH, LOGO_VIEWBOX, LOGO_WORDMARK_PATH } from "@/shared/ui";
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
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#3b1d8f", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, color: "#ffc94d" }}>
          <svg height="72" width="125" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
            <path d={LOGO_WORDMARK_PATH} fill="#ffffff" fillRule="evenodd" />
            <path d={LOGO_PIN_PATH} fill={LOGO_COLORS.red} fillRule="evenodd" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: title.length > 40 ? 62 : 80, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 38, opacity: 0.92 }}>{when}</div>
          {where && <div style={{ fontSize: 34, color: "#ffc94d" }}>{where}</div>}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#ffc94d" }}>Descobrir → Ver → Decidir → Viver</div>
      </div>
    ),
    size,
  );
}
