// Composição do módulo progression (interna): usada pelo index.ts.
import { missionTitle } from "@/modules/missions";
import { sql } from "@/shared/db/sql";
import { lazy } from "@/shared/kernel";
import type { MissionTitles } from "./domain/xp";
import { GetXpOverview, GrantXp } from "./features/xp-ledger/xp-ledger.use-case";
import { PostgresXpLedger } from "./infra/postgres-xp-ledger";

const missionTitles: MissionTitles = { titleOf: missionTitle };

export const xpLedger = lazy(() => new PostgresXpLedger(sql()));
export const grantXp = lazy(() => new GrantXp(xpLedger(), missionTitles));
export const xpOverview = lazy(() => new GetXpOverview(xpLedger()));
