"""Caixas de rosto: escala (detecção em resolução reduzida → quadro cheio) e margem de segurança."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Box:
    x: float
    y: float
    w: float
    h: float

    @property
    def area(self) -> float:
        return max(0.0, self.w) * max(0.0, self.h)

    def scaled(self, factor: float) -> "Box":
        """Leva a caixa da imagem reduzida (onde roda o detector) para o quadro em resolução cheia."""
        return Box(self.x * factor, self.y * factor, self.w * factor, self.h * factor)

    def expanded(self, margin: float, frame_w: int, frame_h: int) -> "Box":
        """Aumenta a caixa em `margin` (ex.: 0.25 = 25%) de cada lado e recorta nos limites do quadro.

        A margem cobre cabelo, queixo e o erro do detector: melhor borrar a mais do que deixar escapar.
        """
        dx, dy = self.w * margin, self.h * margin
        x0, y0 = max(0.0, self.x - dx), max(0.0, self.y - dy)
        x1, y1 = min(float(frame_w), self.x + self.w + dx), min(float(frame_h), self.y + self.h + dy)
        return Box(x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0))

    def as_int(self) -> tuple[int, int, int, int]:
        return int(self.x), int(self.y), int(round(self.w)), int(round(self.h))


def iou(a: Box, b: Box) -> float:
    """Sobreposição (intersection over union) entre duas caixas, de 0 a 1."""
    x0, y0 = max(a.x, b.x), max(a.y, b.y)
    x1, y1 = min(a.x + a.w, b.x + b.w), min(a.y + a.h, b.y + b.h)
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0
