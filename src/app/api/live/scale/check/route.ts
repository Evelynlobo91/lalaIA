import { liveApi } from "@/modules/live";

export const dynamic = "force-dynamic";
// O Vercel Cron chama com GET (e `Authorization: Bearer <CRON_SECRET>`); outros agendadores podem usar POST.
export const GET = liveApi.scaleCheck;
export const POST = liveApi.scaleCheck;
