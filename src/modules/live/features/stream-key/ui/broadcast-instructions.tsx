import { Card, CardTitle } from "@/shared/ui";

/** Como configurar o OBS (computador) e o Larix Broadcaster (celular) com o servidor e a chave. */
export function BroadcastInstructions({ ingestUrl, simulated }: { ingestUrl: string; simulated: boolean }) {
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Como transmitir</CardTitle>
      {simulated && (
        <p className="rounded-xl bg-warning px-3 py-2 text-sm text-warning-fg">
          Ambiente de desenvolvimento: o provedor é simulado. A chave é gerada aqui, nada é transmitido e o player mostra um vídeo de teste.
        </p>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Servidor (URL RTMP)</span>
        <code className="block select-all break-all rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm">{ingestUrl}</code>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="OBS Studio" className="flex flex-col gap-2">
          <h3 className="font-semibold">OBS Studio (computador)</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Configurações → Transmissão → Serviço: <strong>Personalizado</strong>.</li>
            <li>Servidor: cole a URL acima.</li>
            <li>Chave da transmissão: copie a chave do lugar ou evento.</li>
            <li>Saída: 720p a 2.500–4.000 kbps, intervalo de quadro-chave de 2 s.</li>
            <li>Clique em <strong>Iniciar transmissão</strong>. Em alguns segundos a live aparece como &quot;Ao vivo&quot;.</li>
          </ol>
        </section>
        <section aria-label="Larix Broadcaster" className="flex flex-col gap-2">
          <h3 className="font-semibold">Larix Broadcaster (celular)</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Configurações → Conexões → <strong>Nova conexão</strong>.</li>
            <li>URL: a URL acima seguida de <code>/</code> e da chave (ex.: <code>{ingestUrl}/SUA-CHAVE</code>).</li>
            <li>Vídeo: 720p, 30 fps. Áudio pode ficar desligado (o player começa mudo).</li>
            <li>Volte à câmera e toque no botão vermelho para começar.</li>
          </ol>
        </section>
      </div>
    </Card>
  );
}
