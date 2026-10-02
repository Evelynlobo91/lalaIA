import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Base para URLs absolutas nos metadados (Open Graph exige URL completa para o card aparecer).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "LalaIA", template: "%s · LalaIA" },
  description: "O que eu posso fazer agora, em Joinville, que combina comigo?",
  applicationName: "LalaIA",
  appleWebApp: { capable: true, title: "LalaIA", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#3b1d8f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
