"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os QR codes da tela periodicamente (token rotativo). */
export function QrAutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
