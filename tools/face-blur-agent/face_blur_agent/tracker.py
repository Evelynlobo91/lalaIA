"""Persistência entre quadros: um rosto não "pisca" sem borrão quando o detector falha por alguns quadros.

Rastreador simples (associação por IoU + validade em quadros). É suficiente para a fase 1; a fase 2
troca por ByteTrack/SORT com filtro de Kalman, mantendo a mesma interface `update()`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .geometry import Box, iou


@dataclass
class _Track:
    box: Box
    missed: int = 0


@dataclass
class FaceTracker:
    #: Por quantos quadros sem detecção o borrão continua no último lugar conhecido.
    keep_frames: int = 15
    #: Sobreposição mínima para considerar que é o mesmo rosto.
    match_iou: float = 0.2
    _tracks: list[_Track] = field(default_factory=list)

    def update(self, detections: list[Box] | None) -> list[Box]:
        """Atualiza com as detecções do quadro (`None` = o detector não rodou neste quadro).

        Devolve todas as caixas a borrar: as detectadas agora e as que ainda estão dentro da validade.
        """
        if detections is None:
            for track in self._tracks:
                track.missed += 1
        else:
            unmatched = list(detections)
            for track in self._tracks:
                best = max(unmatched, key=lambda d: iou(track.box, d), default=None)
                if best is not None and iou(track.box, best) >= self.match_iou:
                    track.box, track.missed = best, 0
                    unmatched.remove(best)
                else:
                    track.missed += 1
            self._tracks.extend(_Track(box) for box in unmatched)
        self._tracks = [t for t in self._tracks if t.missed <= self.keep_frames]
        return [t.box for t in self._tracks]
