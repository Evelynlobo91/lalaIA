import { ImageResponse } from "next/og";
import { LOGO_COLORS, LOGO_PIN_PATH, LOGO_VIEWBOX, LOGO_WORDMARK_PATH } from "@/shared/ui";
import { getPlaceDetail } from "@/modules/places";

// Imagem do card de compartilhamento (Instagram, WhatsApp...): nome, categoria e bairro na identidade do LalaIA.
export const alt = "Lugar em Joinville no LalaIA";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = await getPlaceDetail(id);
  const name = place?.name ?? "Descubra Joinville";
  const subtitle = place ? [place.categoryLabel, place.neighborhood].filter(Boolean).join(" · ") : "O que fazer agora em Joinville";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#02407f", color: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700, color: "#bcd4f2" }}>
          <svg height="72" width="125" viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}>
            <path d={LOGO_WORDMARK_PATH} fill="#ffffff" fillRule="evenodd" />
            <path d={LOGO_PIN_PATH} fill={LOGO_COLORS.red} fillRule="evenodd" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: name.length > 40 ? 64 : 84, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 40, opacity: 0.9 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#bcd4f2" }}>Descobrir → Ver → Decidir → Viver</div>
      </div>
    ),
    size,
  );
}
