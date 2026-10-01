import { exportPersonalDataRoute } from "@/modules/identity";
import { personalDataSources } from "@/bootstrap/personal-data-sources";

export const dynamic = "force-dynamic";
export const GET = exportPersonalDataRoute(() => personalDataSources);
