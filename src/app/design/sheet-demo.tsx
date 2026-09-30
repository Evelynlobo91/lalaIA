"use client";

import { useState } from "react";
import { Button, Sheet } from "@/shared/ui";

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Abrir painel
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filtros">
        <p className="text-muted">No celular o painel sobe de baixo; no desktop fica centralizado. Esc ou clique fora fecha.</p>
        <Button fullWidth className="mt-6" onClick={() => setOpen(false)}>
          Aplicar
        </Button>
      </Sheet>
    </>
  );
}
