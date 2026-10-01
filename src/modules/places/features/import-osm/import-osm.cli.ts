// Linha de comando da importação de lugares do OpenStreetMap.
//   npm run places:seed              → importa do snapshot salvo (rápido, sem rede)
//   npm run places:import            → busca ao vivo na Overpass API
//   npm run places:import -- --save  → busca ao vivo e atualiza o snapshot salvo
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createSql } from "@/shared/db/sql";
import { FileOsmSource, OverpassOsmSource } from "../../infra/osm-sources";
import { PostgresPlaceImportRepository } from "../../infra/postgres-place-import-repository";
import { ImportOsmPlaces, type OsmSource } from "./import-osm.use-case";

const SNAPSHOT = join(process.cwd(), "supabase", "seed-data", "osm-joinville.json");

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const save = args.includes("--save");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida (veja .env.example).");

  let source: OsmSource = live ? new OverpassOsmSource(undefined, { log: (msg) => console.log(msg) }) : new FileOsmSource(SNAPSHOT);
  if (live && save) {
    const elements = await source.fetchElements();
    await writeFile(SNAPSHOT, JSON.stringify({ generator: "Overpass API", copyright: "© OpenStreetMap contributors, ODbL", elements }));
    console.log(`Snapshot atualizado: ${elements.length} elementos em ${SNAPSHOT}`);
    source = { fetchElements: async () => elements };
  }

  const sql = createSql(url);
  try {
    const report = await new ImportOsmPlaces(source, new PostgresPlaceImportRepository(sql)).execute();
    console.log(`Origem: ${live ? "Overpass API (ao vivo)" : "snapshot salvo"}`);
    console.log(`Elementos lidos: ${report.fetched}`);
    console.log(`Inseridos: ${report.inserted} | Atualizados: ${report.updated} | Sem mudança: ${report.unchanged}`);
    console.log(`Descartados: ${JSON.stringify(report.skipped)}`);
    console.log(`Por categoria: ${JSON.stringify(report.byCategory)}`);
    console.log("Dados: © OpenStreetMap contributors (ODbL).");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Falha na importação:", error instanceof Error ? error.message : error);
  process.exit(1);
});
