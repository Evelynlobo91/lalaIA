import { MapPinOff } from "lucide-react";
import { ButtonLink, EmptyState } from "@/shared/ui";

export default function LugarNaoEncontrado() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Lugar não encontrado"
      description="Esse lugar não existe ou foi removido."
      action={
        <ButtonLink href="/lugares" variant="secondary" size="sm">
          Ver outros lugares
        </ButtonLink>
      }
    />
  );
}
