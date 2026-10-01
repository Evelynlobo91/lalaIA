import { PlaceListSkeleton } from "@/modules/places";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando lugares">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-surface-2" />
      <PlaceListSkeleton />
    </div>
  );
}
