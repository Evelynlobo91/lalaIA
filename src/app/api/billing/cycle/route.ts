import { billingApi } from "@/modules/billing";

export const dynamic = "force-dynamic";
// O Vercel Cron chama com GET (e `Authorization: Bearer <CRON_SECRET>`); outros agendadores podem usar POST.
export const GET = billingApi.cycle;
export const POST = billingApi.cycle;
