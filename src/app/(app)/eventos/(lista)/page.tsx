import type { Metadata } from "next";
import { EventList, firstEventsPage } from "@/modules/events";

export const metadata: Metadata = { title: "O que fazer", description: "Shows, feiras, festas e exposições acontecendo em Joinville." };
// Depende do momento ("acontecendo agora", eventos que já terminaram somem).
export const dynamic = "force-dynamic";

export default async function EventosPage() {
  const initial = await firstEventsPage();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold md:text-3xl">O que fazer</h1>
        <p className="text-muted">Shows, feiras, festas e exposições acontecendo ou chegando em Joinville.</p>
      </header>
      <EventList initial={initial} />
    </div>
  );
}
