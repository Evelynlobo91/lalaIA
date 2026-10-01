import "server-only";
import QRCode from "qrcode";

/** QR code como SVG, gerado no servidor (sem serviço externo). Correção "M": aguenta impressão gasta/reflexo. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
}
