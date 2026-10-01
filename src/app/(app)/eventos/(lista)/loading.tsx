import { EventListSkeleton } from "@/modules/events";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando eventos">
      <div className="h-9 w-48 animate-pulse rounded-xl bg-surface-2" />
      <EventListSkeleton />
    </div>
  );
}
