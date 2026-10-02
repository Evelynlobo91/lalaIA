import { CalendarX } from "lucide-react";
import { ButtonLink, EmptyState } from "@/shared/ui";

export default function EventoNaoEncontrado() {
  return (
    <EmptyState
      icon={CalendarX}
      title="Evento não encontrado"
      description="Esse evento não existe ou foi removido."
      action={
        <ButtonLink href="/eventos" variant="secondary" size="sm">
          Ver outros eventos
        </ButtonLink>
      }
    />
  );
}
