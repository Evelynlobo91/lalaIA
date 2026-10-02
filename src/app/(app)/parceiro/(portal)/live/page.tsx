import type { Metadata } from "next";
import { BroadcastInstructions, agentStatusOf, LiftRestrictionButton, chatRestrictions, chatSettingsOf, LivePrivacyGuidelines, LivePrivacyNotice, LiveTargetsList, liveMetrics, livePortal, livePrivacyAcceptedAt, liveViewersNow } from "@/modules/live";
import { hasPlanFeature } from "@/modules/billing";
import { requirePartner } from "@/modules/partners";
import { formatDateTime } from "@/shared/time/joinville-time";

export const metadata: Metadata = { title: "Live · Portal do parceiro" };
// O status da transmissão muda a qualquer momento (webhooks do provedor).
export const dynamic = "force-dynamic";

export default async function LivePortalPage() {
  const { user } = await requirePartner("/parceiro/live");
  const [view, metrics, acceptedAt, viewers, hasChat, agents] = await Promise.all([livePortal(user), liveMetrics(user), livePrivacyAcceptedAt(user), liveViewersNow(user), hasPlanFeature(user.id, "chat"), agentStatusOf(user)]);
  // Opções e moderação do chat só para quem tem o recurso no plano.
  const [chat, restrictions] = hasChat ? await Promise.all([chatSettingsOf(user), chatRestrictions(user)]) : [{}, []];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Live</h1>
        <p className="text-muted">Transmita o ambiente ao vivo para quem está decidindo aonde ir agora.</p>
      </div>
      <LivePrivacyNotice />
      <LivePrivacyGuidelines acceptedAt={acceptedAt} />
      <section aria-labelledby="live-transmissoes" className="flex flex-col gap-3">
        <h2 id="live-transmissoes" className="text-lg font-semibold">
          Seus lugares e eventos
        </h2>
        <LiveTargetsList targets={view.targets} metrics={metrics} viewers={viewers} chat={chat} agents={agents} canBroadcast={acceptedAt !== null} />
        <p className="text-sm text-muted">
          Métricas: &quot;Assistiram&quot; conta quantas vezes o vídeo começou a tocar (uma vez por aba) e &quot;Acessos à
          página&quot;, as visitas à página do lugar ou evento. Só contagens: não registramos quem assistiu.
        </p>
      </section>
      {restrictions.length > 0 && (
        <section aria-labelledby="chat-restricoes" className="flex flex-col gap-3">
          <h2 id="chat-restricoes" className="text-lg font-semibold">
            Silenciados e banidos do chat
          </h2>
          <ul className="flex flex-col gap-2" aria-label="Silenciados e banidos do chat">
            {restrictions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                <p className="min-w-0 flex-1 basis-48">
                  <span className="font-medium">{r.userName}</span>{" "}
                  <span className="text-muted">
                    · {r.kind === "ban" ? "banido dos seus chats" : r.expiresAt ? `silenciado até ${formatDateTime(r.expiresAt)}` : "silenciado até o fim da live"}
                  </span>
                </p>
                <LiftRestrictionButton restrictionId={r.id} userName={r.userName} kind={r.kind} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <BroadcastInstructions ingestUrl={view.ingestUrl} simulated={view.simulated} />
    </div>
  );
}
