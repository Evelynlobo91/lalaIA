"""Testes da lógica de proteção (sem OpenCV): python -m unittest discover -s tests"""

import json
import unittest

from face_blur_agent.failsafe import FailSafe, Mode
from face_blur_agent.geometry import Box, iou
from face_blur_agent.heartbeat import build_payload
from face_blur_agent.tracker import FaceTracker


class GeometryTest(unittest.TestCase):
    def test_escala_da_deteccao_reduzida_para_o_quadro_cheio(self):
        self.assertEqual(Box(10, 20, 30, 40).scaled(3), Box(30, 60, 90, 120))

    def test_margem_aumenta_e_recorta_nos_limites(self):
        self.assertEqual(Box(100, 100, 100, 100).expanded(0.25, 1920, 1080), Box(75, 75, 150, 150))
        # Rosto no canto: a margem não sai do quadro.
        self.assertEqual(Box(0, 0, 40, 40).expanded(0.25, 100, 100), Box(0, 0, 50, 50))

    def test_iou(self):
        self.assertAlmostEqual(iou(Box(0, 0, 10, 10), Box(0, 0, 10, 10)), 1.0)
        self.assertEqual(iou(Box(0, 0, 10, 10), Box(20, 20, 10, 10)), 0.0)


class TrackerTest(unittest.TestCase):
    def test_rosto_nao_pisca_quando_o_detector_falha_alguns_quadros(self):
        tracker = FaceTracker(keep_frames=3)
        face = Box(100, 100, 50, 50)
        self.assertEqual(tracker.update([face]), [face])
        for _ in range(3):  # detector não rodou / não achou: continua borrando no último lugar
            self.assertEqual(tracker.update(None), [face])
        self.assertEqual(tracker.update([]), [])  # passou da validade

    def test_acompanha_o_rosto_em_movimento_e_aceita_rosto_novo(self):
        tracker = FaceTracker()
        tracker.update([Box(100, 100, 50, 50)])
        moved, new = Box(110, 105, 50, 50), Box(500, 300, 40, 40)
        self.assertEqual(sorted(tracker.update([moved, new]), key=lambda b: b.x), [moved, new])


class FailSafeTest(unittest.TestCase):
    def test_comeca_protegido_e_so_libera_apos_quadros_saudaveis(self):
        guard = FailSafe(recover_frames=3)
        modes = [guard.evaluate(detector_ok=True, detection_age_ms=10, fps=30) for _ in range(3)]
        self.assertEqual(modes, [Mode.FULL, Mode.FULL, Mode.FACES])

    def test_erro_atraso_ou_fps_baixo_borra_o_quadro_inteiro_na_hora(self):
        for kwargs, reason in [
            ({"detector_ok": False, "detection_age_ms": 10, "fps": 30}, "erro"),
            ({"detector_ok": True, "detection_age_ms": 900, "fps": 30}, "atrasada"),
            ({"detector_ok": True, "detection_age_ms": 10, "fps": 4}, "FPS"),
        ]:
            guard = FailSafe(recover_frames=1)
            guard.evaluate(detector_ok=True, detection_age_ms=10, fps=30)
            self.assertIs(guard.mode, Mode.FACES)
            self.assertIs(guard.evaluate(**kwargs), Mode.FULL)
            self.assertIn(reason, guard.reason)

    def test_volta_so_depois_de_estabilizar(self):
        guard = FailSafe(recover_frames=2)
        guard.evaluate(detector_ok=False, detection_age_ms=0, fps=30)
        self.assertIs(guard.evaluate(detector_ok=True, detection_age_ms=10, fps=30), Mode.FULL)
        self.assertIs(guard.evaluate(detector_ok=True, detection_age_ms=10, fps=30), Mode.FACES)


class HeartbeatTest(unittest.TestCase):
    def test_so_numeros_e_status_nunca_imagem(self):
        payload = json.loads(build_payload(Mode.FACES, 29.97, 1.234, "ok", now=1.0).to_json())
        self.assertEqual(payload, {"privacy_mode": "on", "blur_mode": "faces", "fps": 30.0, "faces_per_frame": 1.23, "detector_status": "ok", "sent_at": 1.0})


if __name__ == "__main__":
    unittest.main()
