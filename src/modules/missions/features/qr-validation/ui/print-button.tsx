"use client";

import { Printer } from "lucide-react";
import { Button } from "@/shared/ui";

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden className="size-5" /> Imprimir
    </Button>
  );
}
