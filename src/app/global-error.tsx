"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Última barreira: erro não tratado no layout raiz. Reporta e mostra uma tela amigável.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }}>
          <h1>Algo deu errado</h1>
          <p>Já fomos avisados. Tente novamente em instantes.</p>
          {error.digest && <p style={{ opacity: 0.6, fontSize: 12 }}>Código: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
