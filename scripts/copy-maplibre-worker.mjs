// Copia o Web Worker do MapLibre (v6, módulos ES) para public/, servido pelo próprio app.
// O bundler do Next reescreve o arquivo principal e quebra o caminho relativo do worker;
// apontar o worker para um arquivo estático (setWorkerUrl) é o caminho suportado pela biblioteca.
// Roda antes de `dev` e `build` (predev/prebuild). A versão vai no caminho para invalidar cache.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
const dist = join(dirname(pkgPath), "dist");
const vendorRoot = join(process.cwd(), "public", "vendor", "maplibre");
const target = join(vendorRoot, version);

rmSync(vendorRoot, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, file), join(target, file));
}
console.log(`MapLibre worker ${version} copiado para public/vendor/maplibre/${version}/`);
