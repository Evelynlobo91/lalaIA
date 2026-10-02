/**
 * Polling leve da POC (RNF20): roda `task` a cada `intervalMs` SÓ com a aba visível. Aba em segundo plano
 * não consulta; ao voltar, consulta na hora. Cada execução recebe um AbortSignal (a anterior é cancelada).
 * Devolve a função de parada (para o cleanup do useEffect).
 * Evolução documentada: Supabase Realtime no lugar do polling (docs/live.md).
 */
export function pollWhileVisible(task: (signal: AbortSignal) => Promise<void>, intervalMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let stopped = false;

  async function run() {
    if (stopped || document.visibilityState !== "visible") return;
    controller?.abort();
    controller = new AbortController();
    try {
      await task(controller.signal);
    } catch {
      // Falha de rede: mantém o último estado e tenta no próximo ciclo.
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (!stopped && document.visibilityState === "visible") timer = setTimeout(run, intervalMs);
  }

  function onVisibility() {
    if (document.visibilityState === "visible") void run();
    else clearTimeout(timer);
  }

  schedule();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
