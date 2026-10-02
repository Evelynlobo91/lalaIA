"""Laço principal: câmera → detector (YuNet) → rastreador → borrão → FFmpeg (H.264, sem áudio) → RTMP do Mux.

O vídeo original nunca sai desta máquina: só os quadros já borrados vão para o FFmpeg. Nada é gravado
em disco (nem quadros, nem recortes, nem vetores de rosto). Detecção, nunca reconhecimento.
"""

from __future__ import annotations

import logging
import subprocess
import time
from dataclasses import dataclass

import cv2  # type: ignore[import-not-found]
import numpy as np  # type: ignore[import-not-found]

from . import heartbeat
from .failsafe import FailSafe, Mode
from .geometry import Box
from .tracker import FaceTracker

log = logging.getLogger("face-blur-agent")


@dataclass(frozen=True)
class Config:
    source: str
    rtmp_url: str
    model_path: str
    fps: int = 30
    detect_width: int = 640
    detect_every: int = 3
    #: Limite baixo de propósito: recall acima da precisão (borrar um falso positivo é aceitável).
    score_threshold: float = 0.5
    margin: float = 0.25
    bitrate: str = "4500k"
    heartbeat_url: str | None = None
    heartbeat_token: str | None = None
    heartbeat_every_s: float = 10.0


def pixelate(region: np.ndarray, blocks: int = 12) -> np.ndarray:
    h, w = region.shape[:2]
    if h == 0 or w == 0:
        return region
    small = cv2.resize(region, (max(1, w // blocks), max(1, h // blocks)), interpolation=cv2.INTER_LINEAR)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)


def blur_faces(frame: np.ndarray, boxes: list[Box], margin: float) -> None:
    """Borra só os rostos, em formato oval, com margem. Altera o quadro no lugar."""
    fh, fw = frame.shape[:2]
    for box in boxes:
        x, y, w, h = box.expanded(margin, fw, fh).as_int()
        if w <= 0 or h <= 0:
            continue
        roi = frame[y : y + h, x : x + w]
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.ellipse(mask, (w // 2, h // 2), (w // 2, h // 2), 0, 0, 360, 255, -1)
        roi[mask > 0] = pixelate(roi)[mask > 0]


def blur_full(frame: np.ndarray) -> np.ndarray:
    """Modo de proteção: quadro inteiro irreconhecível."""
    return pixelate(frame, blocks=40)


def open_encoder(cfg: Config, width: int, height: int) -> subprocess.Popen[bytes]:
    command = [
        "ffmpeg", "-loglevel", "warning",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}", "-r", str(cfg.fps), "-i", "-",
        "-an",  # sem áudio por padrão (RNF16, #55)
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-pix_fmt", "yuv420p",
        "-g", str(cfg.fps * 2), "-b:v", cfg.bitrate, "-maxrate", cfg.bitrate, "-bufsize", "9000k",
        "-f", "flv", cfg.rtmp_url,
    ]  # fmt: skip
    return subprocess.Popen(command, stdin=subprocess.PIPE)


def run(cfg: Config) -> None:
    capture = cv2.VideoCapture(int(cfg.source) if cfg.source.isdigit() else cfg.source)
    if not capture.isOpened():
        raise SystemExit(f"Não consegui abrir a câmera/fonte: {cfg.source}")
    ok, frame = capture.read()
    if not ok:
        raise SystemExit("A câmera não entregou nenhum quadro.")
    height, width = frame.shape[:2]
    scale = width / cfg.detect_width
    detect_size = (cfg.detect_width, int(round(height / scale)))

    detector = cv2.FaceDetectorYN.create(cfg.model_path, "", detect_size, cfg.score_threshold, 0.3, 5000)
    tracker, guard = FaceTracker(), FailSafe()
    encoder = open_encoder(cfg, width, height)
    last_detection = 0.0
    frame_index, faces_total, last_beat, fps = 0, 0, 0.0, float(cfg.fps)
    last_tick = time.monotonic()

    log.info("transmitindo com borrão de rostos (%sx%s, detecção em %sx%s)", width, height, *detect_size)
    try:
        while ok:
            now = time.monotonic()
            fps = 0.9 * fps + 0.1 * (1.0 / max(1e-3, now - last_tick))
            last_tick = now

            detector_ok, detections = True, None
            if frame_index % cfg.detect_every == 0:
                try:
                    _, faces = detector.detect(cv2.resize(frame, detect_size))
                    detections = [] if faces is None else [Box(*f[:4]).scaled(scale) for f in faces]
                    last_detection = now
                except cv2.error as error:  # detector travou: o guarda borra o quadro inteiro
                    detector_ok = False
                    log.warning("falha no detector: %s", error)
            boxes = tracker.update(detections)
            faces_total += len(boxes)

            mode = guard.evaluate(detector_ok=detector_ok, detection_age_ms=(now - last_detection) * 1000, fps=fps)
            if mode is Mode.FULL:
                frame = blur_full(frame)
            else:
                blur_faces(frame, boxes, cfg.margin)

            assert encoder.stdin is not None
            encoder.stdin.write(frame.tobytes())

            if cfg.heartbeat_url and cfg.heartbeat_token and now - last_beat >= cfg.heartbeat_every_s:
                payload = heartbeat.build_payload(mode, fps, faces_total / max(1, frame_index + 1), guard.reason)
                heartbeat.send(cfg.heartbeat_url, cfg.heartbeat_token, payload)
                last_beat = now

            frame_index += 1
            ok, frame = capture.read()
    finally:
        capture.release()
        if encoder.stdin:
            encoder.stdin.close()
        encoder.wait(timeout=10)
