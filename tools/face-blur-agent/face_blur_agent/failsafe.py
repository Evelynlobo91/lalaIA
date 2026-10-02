"""Proteção contra falha: na dúvida, borra o quadro inteiro. Nunca transmite sem proteção."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Mode(str, Enum):
    #: Só os rostos borrados (operação normal).
    FACES = "faces"
    #: Quadro inteiro borrado (detector com erro, lento ou atrasado).
    FULL = "full"


@dataclass
class FailSafe:
    """Decide, a cada quadro, se dá para confiar no detector.

    Vai para FULL na hora em que algo dá errado (erro, detecção velha demais, FPS baixo) e só volta
    para FACES depois de `recover_frames` quadros saudáveis seguidos, para não ficar alternando.
    """

    #: Idade máxima da última detecção bem-sucedida (ms) para ainda confiar no rastreador.
    max_detection_age_ms: float = 500.0
    #: Abaixo disso o processamento está atrasado demais.
    min_fps: float = 10.0
    recover_frames: int = 30
    mode: Mode = Mode.FULL  # começa protegido até provar que o detector está saudável
    _healthy_streak: int = 0
    reason: str = "iniciando"

    def evaluate(self, *, detector_ok: bool, detection_age_ms: float, fps: float) -> Mode:
        problem = None
        if not detector_ok:
            problem = "erro no detector"
        elif detection_age_ms > self.max_detection_age_ms:
            problem = f"detecção atrasada ({detection_age_ms:.0f} ms)"
        elif fps < self.min_fps:
            problem = f"FPS baixo ({fps:.1f})"

        if problem:
            self.mode, self._healthy_streak, self.reason = Mode.FULL, 0, problem
            return self.mode

        self._healthy_streak += 1
        if self.mode is Mode.FULL and self._healthy_streak >= self.recover_frames:
            self.mode, self.reason = Mode.FACES, "ok"
        return self.mode
