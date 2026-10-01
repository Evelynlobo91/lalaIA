# Agente de borrão de rostos (Live, #97, fase 1)

**O borrão acontece antes do vídeo sair do estabelecimento.** O vídeo original nunca chega ao Mux nem ao
LalaIA. Borrar no player do espectador não atende a LGPD, porque o original continuaria trafegando.

O agente faz **detecção** de rosto (onde há um rosto), **nunca reconhecimento** (quem é). Só as regiões dos
rostos são borradas; o resto do ambiente fica nítido. Nada é gravado: nem quadros, nem recortes, nem vetores.

```
Câmera → OpenCV → YuNet (640 px, a cada 3 quadros) → rastreador → borrão oval com margem de 25%
       → FFmpeg (H.264, sem áudio) → RTMPS → Mux → LalaIA
```

## Opção A: OBS + plugin (sem programar)

1. Instale o [OBS Studio](https://obsproject.com) e o plugin
   [obs-detect](https://github.com/royshil/obs-detect) (detecção de rostos local).
2. Na fonte da câmera: **Filtros → Detect → Face** com máscara **Blur**/**Pixelate**, confiança baixa (0,3 a 0,5)
   e "expandir máscara" em 20 a 30%.
3. **Configurações → Áudio:** desative o microfone (sem áudio por padrão).
4. **Configurações → Transmissão:** serviço "Personalizado", servidor `rtmps://global-live.mux.com:443/app` e a
   chave do portal (LalaIA → Parceiro → Live).
5. Antes de abrir para o público, faça o teste de validação abaixo.

Limitação: o plugin não tem a proteção "falhou → borra tudo". Se o OBS travar, encerre a live no portal.

## Opção B: este script (com proteção contra falha)

Requisitos: Python 3.11+, [FFmpeg](https://ffmpeg.org/download.html) no PATH e o modelo YuNet do OpenCV Zoo
([`face_detection_yunet_2023mar.onnx`](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)).

```bash
cd tools/face-blur-agent
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export STREAM_KEY="<chave do portal>"           # nunca na linha de comando
python -m face_blur_agent --source 0 --model face_detection_yunet_2023mar.onnx
```

| Opção | Padrão | Para quê |
|-------|--------|----------|
| `--source` | `0` | Câmera USB (índice), URL RTSP de câmera IP ou arquivo de vídeo (teste) |
| `--score` | `0.5` | Confiança mínima. **Baixa de propósito:** priorizar não deixar rosto escapar |
| `--margin` | `0.25` | Margem do borrão sobre a caixa do rosto (cabelo, queixo, erro do detector) |
| `--detect-width` | `640` | Detecção em resolução reduzida; o borrão é aplicado no quadro cheio |
| `--detect-every` | `3` | Detector a cada N quadros; entre eles, o rastreador mantém o borrão |
| `--heartbeat-url` | (vazio) | Endpoint de heartbeat da plataforma (quando existir), com `HEARTBEAT_TOKEN` |

### Proteção contra falha

- O agente **começa com o quadro inteiro borrado** e só libera depois de 30 quadros saudáveis.
- Se o detector der erro, a última detecção ficar com mais de 500 ms ou o FPS cair abaixo de 10, o **quadro
  inteiro é borrado na hora**, até normalizar. Nunca sai um quadro sem proteção.
- Um rosto que o detector perde por alguns quadros continua borrado no último lugar conhecido (15 quadros).

### Heartbeat (privacidade confirmada)

A cada 10 s, se configurado, envia só números: `privacy_mode=on`, modo do borrão (`faces`/`full`), FPS,
rostos por quadro e status do detector. Nunca imagem. A ligação com "a live só ativa com o modo privacidade
confirmado" entra no portal com o checklist do #55.

## Teste de validação (antes de abrir para o público)

Grave a saída com um arquivo de vídeo como fonte (`--source teste.mp4`) e confira, quadro a quadro, que
nenhum rosto aparece nítido nestes casos: pessoas andando, de perfil, de costas, longe da câmera e com pouca
luz. Para simular falha, desconecte a câmera ou mate o processo do detector: o quadro inteiro deve borrar.

## Testes da lógica

```bash
python -m unittest discover -s tests
```

Cobrem margem e escala das caixas, persistência do rastreador, a proteção contra falha e o heartbeat
(sem OpenCV). O laço com câmera, YuNet e FFmpeg (`agent.py`) precisa ser validado com o teste acima.

## Fases seguintes (roadmap)

- **Fase 2:** caixinha de borda (Jetson Orin Nano + DeepStream + SCRFD/YOLOv8-face + ByteTrack) entregue
  configurada, com atualização remota e alerta no portal pelo heartbeat.
- **Fase 3:** auditoria na plataforma por amostragem de quadros: rosto nítido → pausa automática da live.
