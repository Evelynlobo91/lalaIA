import { NotFoundError, err, ok, type Result } from "@/shared/kernel";
import type { MissionPlaces, MissionRepository } from "../../domain/mission";
import { printTokenExpiry, screenTokenExpiry, type StepTokenSigner } from "../../domain/step-validation";

export type QrMode = "screen" | "print";

export interface QrRenderer {
  svg(text: string): Promise<string>;
}

export type StepQrCode = { stepId: string; position: number; title: string; placeName: string; url: string; svg: string };
export type MissionQrCodes = { missionId: string; title: string; mode: QrMode; expiresAt: Date; steps: StepQrCode[] };

/**
 * QR code de cada etapa para o balcão (portal do parceiro). O QR leva a /missoes/validar?t=<token assinado>.
 * Na tela ("screen") o token gira a cada minuto; o impresso ("print") vale até o fim do dia.
 */
export class GetStepQrCodes {
  constructor(
    private readonly missions: Pick<MissionRepository, "findById">,
    private readonly places: Pick<MissionPlaces, "summaries">,
    private readonly tokens: Pick<StepTokenSigner, "sign">,
    private readonly renderer: QrRenderer,
    private readonly siteUrl: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(viewer: { id: string; isAdmin: boolean }, missionId: string, mode: QrMode): Promise<Result<MissionQrCodes, NotFoundError>> {
    const mission = await this.missions.findById(missionId);
    // Só o dono (ou admin) gera QR; para os demais a missão "não existe" (não revela que existe).
    if (!mission || (mission.ownerId !== viewer.id && !viewer.isAdmin) || mission.status !== "active") return err(new NotFoundError("Missão"));

    const now = this.now();
    const expiresAt = mode === "print" ? printTokenExpiry(now) : screenTokenExpiry(now);
    const names = new Map((await this.places.summaries([...new Set(mission.steps.map((s) => s.placeId))])).map((p) => [p.id, p.name]));

    const steps = await Promise.all(
      mission.steps.map(async (step) => {
        const url = new URL("/missoes/validar", this.siteUrl());
        url.searchParams.set("t", this.tokens.sign(step.id, expiresAt));
        return {
          stepId: step.id,
          position: step.position,
          title: step.title,
          placeName: names.get(step.placeId) ?? "Lugar indisponível",
          url: url.toString(),
          svg: await this.renderer.svg(url.toString()),
        };
      }),
    );
    return ok({ missionId: mission.id, title: mission.title, mode, expiresAt, steps });
  }
}
