"""Heartbeat do agente para a plataforma (status do modo privacidade). Só números: nunca imagem ou rosto."""

from __future__ import annotations

import json
import time
import urllib.request
from dataclasses import dataclass

from .failsafe import Mode


@dataclass(frozen=True)
class HeartbeatPayload:
    privacy_mode: str  # "on" sempre que o agente está transmitindo (com rostos ou quadro inteiro borrados)
    blur_mode: str
    fps: float
    faces_per_frame: float
    detector_status: str
    sent_at: float

    def to_json(self) -> bytes:
        return json.dumps(self.__dict__, ensure_ascii=False).encode("utf-8")


def build_payload(mode: Mode, fps: float, faces_per_frame: float, detector_status: str, now: float | None = None) -> HeartbeatPayload:
    return HeartbeatPayload(
        privacy_mode="on",
        blur_mode=mode.value,
        fps=round(fps, 1),
        faces_per_frame=round(faces_per_frame, 2),
        detector_status=detector_status,
        sent_at=now if now is not None else time.time(),
    )


def send(url: str, token: str, payload: HeartbeatPayload, timeout: float = 3.0) -> bool:
    """Envia o heartbeat. Falha de rede nunca derruba a transmissão (o borrão continua igual)."""
    request = urllib.request.Request(
        url,
        data=payload.to_json(),
        method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (URL configurada pelo operador)
            return 200 <= response.status < 300
    except OSError:
        return False
