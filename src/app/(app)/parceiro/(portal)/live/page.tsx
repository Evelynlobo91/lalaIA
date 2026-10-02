import type { Metadata } from "next";
import { BroadcastInstructions, LivePrivacyNotice, LiveTargetsList, livePortal } from "@/modules/live";
import { requirePartner } from "@/modules/partners";

export const metadata: Metadata = { title: "Live · Portal do parceiro" };
// O status da transmissão muda a qualquer momento (webhooks do provedor).
export const dynamic = "force-dynamic";

export default async function LivePortalPage() {
  const { user } = await requirePartner("/parceiro/live");
  const view = await livePortal(user);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Live</h1>
        <p className="text-muted">Transmita o ambiente ao vivo para quem está decidindo aonde ir agora.</p>
      </div>
      <LivePrivacyNotice />
      <section aria-labelledby="live-transmissoes" className="flex flex-col gap-3">
        <h2 id="live-transmissoes" className="text-lg font-semibold">
          Seus lugares e eventos
        </h2>
        <LiveTargetsList targets={view.targets} />
      </section>
      <BroadcastInstructions ingestUrl={view.ingestUrl} simulated={view.simulated} />
    </div>
  );
}
