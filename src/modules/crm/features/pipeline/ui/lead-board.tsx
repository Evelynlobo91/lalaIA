import Link from "next/link";
import { Card } from "@/shared/ui";
import { leadStages, sourceLabel } from "../../../domain/lead";
import type { LeadListItem } from "../../leads/leads.use-cases";
import { MoveLeadForm } from "./move-lead-form";

/**
 * Funil em colunas (#148): uma coluna por etapa, com a contagem. No celular as colunas ficam uma embaixo da
 * outra; a partir do tablet rolam na horizontal dentro do próprio quadro, sem alargar a página.
 */
export function LeadBoard({ leads, canWrite }: { leads: LeadListItem[]; canWrite: boolean }) {
  return (
    <div className="md:overflow-x-auto md:pb-2">
      <div className="flex flex-col gap-4 md:w-max md:flex-row md:items-start">
        {leadStages.map((stage) => {
          const inStage = leads.filter((lead) => lead.stage === stage.id);
          const headingId = `etapa-${stage.id}`;
          return (
            <section key={stage.id} aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-3 md:w-72">
              <h2 id={headingId} className="text-sm font-semibold">
                {stage.label} <span className="font-normal text-muted">({inStage.length})</span>
              </h2>
              {inStage.length === 0 ? (
                <p className="text-sm text-muted">Nenhum lead nesta etapa.</p>
              ) : (
                <ul className="flex flex-col gap-3" aria-label={`Leads em ${stage.label}`}>
                  {inStage.map((lead) => (
                    <li key={lead.id}>
                      <Card className="flex flex-col gap-2 p-3" aria-label={lead.businessName}>
                        <div className="min-w-0">
                          <p className="font-medium">
                            <Link href={`/admin/leads/${lead.id}`} prefetch={false} className="hover:underline">
                              {lead.businessName}
                            </Link>
                          </p>
                          <p className="text-sm text-muted">
                            {lead.contactName} · {sourceLabel(lead.source)}
                          </p>
                          <p className="text-sm text-muted">Responsável: {lead.ownerName}</p>
                          {lead.lostReason && <p className="text-sm">Motivo: {lead.lostReason}</p>}
                        </div>
                        {canWrite && <MoveLeadForm leadId={lead.id} businessName={lead.businessName} stage={lead.stage} />}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
