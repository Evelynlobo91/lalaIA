import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BACKOFFICE_HOME, backofficeSections } from "@/modules/backoffice";
import { requireRole } from "@/modules/identity";
import { Card, CardDescription, CardTitle } from "@/shared/ui";

export const metadata: Metadata = { title: "Backoffice", robots: { index: false } };

export default async function BackofficeHomePage() {
  await requireRole("admin", "/admin");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Backoffice</h1>
      <p className="text-muted">Operação interna do LalaIA. O que você precisa fazer?</p>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Seções do backoffice">
        {backofficeSections
          .filter((s) => s.href !== BACKOFFICE_HOME)
          .map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-sm">
                <Card as="div" className="flex items-center gap-3">
                  <Icon aria-hidden className="size-6 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                  <ChevronRight aria-hidden className="size-5 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
