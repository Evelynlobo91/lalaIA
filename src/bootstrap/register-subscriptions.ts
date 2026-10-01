import { domainEvents, type ModuleSubscriptions } from "@/shared/events";

// Módulos que reagem a eventos de domínio. Ao criar um, adicione a importação do seu `index.ts`:
//   () => import("@/modules/progression").then((m) => m.subscriptions),
const modulesWithSubscriptions: Array<() => Promise<ModuleSubscriptions>> = [
  () => import("@/modules/places").then((m) => m.subscriptions),
  () => import("@/modules/progression").then((m) => m.subscriptions),
];

export async function registerSubscriptions(): Promise<void> {
  const bus = domainEvents();
  for (const load of modulesWithSubscriptions) {
    (await load())(bus);
  }
}
