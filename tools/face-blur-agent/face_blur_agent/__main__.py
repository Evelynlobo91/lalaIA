"""Uso: python -m face_blur_agent --source 0 --model face_detection_yunet_2023mar.onnx

A stream key vem da variável STREAM_KEY (nunca na linha de comando, para não ficar no histórico).
"""

from __future__ import annotations

import argparse
import logging
import os

DEFAULT_INGEST = "rtmps://global-live.mux.com:443/app"


def main() -> None:
    parser = argparse.ArgumentParser(description="Borra rostos antes de o vídeo sair do estabelecimento (LalaIA).")
    parser.add_argument("--source", default="0", help="Índice da câmera (0), URL RTSP ou arquivo de vídeo")
    parser.add_argument("--model", required=True, help="Modelo YuNet (.onnx) do OpenCV Zoo")
    parser.add_argument("--ingest", default=DEFAULT_INGEST, help="Servidor RTMP(S) do provedor")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--detect-width", type=int, default=640)
    parser.add_argument("--detect-every", type=int, default=3)
    parser.add_argument("--score", type=float, default=0.5, help="Limite de confiança (baixo = mais recall)")
    parser.add_argument("--margin", type=float, default=0.25, help="Margem do borrão (0.2 a 0.3)")
    parser.add_argument("--heartbeat-url", default=os.environ.get("HEARTBEAT_URL"))
    args = parser.parse_args()

    stream_key = os.environ.get("STREAM_KEY")
    if not stream_key:
        raise SystemExit("Defina a variável STREAM_KEY com a chave do portal do parceiro (LalaIA → Live).")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from .agent import Config, run  # importa OpenCV só aqui (testes da lógica não precisam dele)

    run(
        Config(
            source=args.source,
            rtmp_url=f"{args.ingest.rstrip('/')}/{stream_key}",
            model_path=args.model,
            fps=args.fps,
            detect_width=args.detect_width,
            detect_every=args.detect_every,
            score_threshold=args.score,
            margin=args.margin,
            heartbeat_url=args.heartbeat_url,
            heartbeat_token=os.environ.get("HEARTBEAT_TOKEN"),
        )
    )


if __name__ == "__main__":
    main()
