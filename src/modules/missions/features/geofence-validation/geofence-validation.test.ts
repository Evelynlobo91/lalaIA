import { describe, expect, it, vi } from "vitest";
import { GEOFENCE_ATTEMPTS, dwellStatus, geofenceFor, roundDistance, type GeofenceAttempt, type GeofenceOutcome } from "../../domain/geofence";
import { allowsRealReward, type MissionRecord, type MissionStep } from "../../domain/mission";
import { HmacStepTokens } from "../../infra/hmac-step-tokens";
import { CompleteStep } from "../qr-validation/complete-step.use-case";
import { QrCodeValidator } from "../qr-validation/qr-code-validator";
import { QrStepValidation } from "../qr-validation/qr-validation.use-case";
import { completeStepSchema } from "../qr-validation/qr-validation.schema";
import { GeofenceCheck, GeofenceValidator, QrAndGeofenceValidator } from "./geofence-validator";
import { GeofenceCheckIn } from "./geofence-validation.use-case";
import { geofenceCheckInSchema } from "./geofence-validation.schema";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-15T12:00:00Z");
const now = () => NOW;
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const tokens = new HmacStepTokens("segredo-de-teste-com-mais-de-32-caracteres!!");
const fix = (accuracyMeters = 15) => ({ lat: -26.3045, lon: -48.8456, accuracyMeters });

const gpsStep = (patch: Partial<MissionStep> = {}): MissionStep => ({
  id: S1,
  missionId: "m1",
  position: 1,
  title: "Chegue à Rua das Palmeiras",
  placeId: "palmeiras",
  validation: "gps",
  geofence: { radiusMeters: 100, dwellMinutes: 2 },
  ...patch,
});

const mission = (steps: MissionStep[]): MissionRecord => ({
  id: "m1",
  ownerId: "parceiro",
  title: "Passeio no Centro",
  description: "Explore o Centro de Joinville.",
  xp: 90,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T00:00:00Z"),
  status: "active",
  createdAt: new Date("2026-09-30T00:00:00Z"),
  steps,
});

const attempt = (outcome: GeofenceOutcome, minutes: number, distanceMeters: number | null = 40): GeofenceAttempt => ({ outcome, distanceMeters, attemptedAt: minutesAgo(minutes) });

function setup(opts: { m?: MissionRecord; previous?: GeofenceAttempt[]; distance?: number | null; consent?: boolean; done?: string[] } = {}) {
  const m = opts.m ?? mission([gpsStep(), gpsStep({ id: S2, position: 2, title: "Visite o Museu" })]);
  const recorded: Array<{ outcome: GeofenceOutcome; distanceMeters: number | null }> = [];
  const attempts = {
    recent: vi.fn().mockResolvedValue(opts.previous ?? []),
    record: vi.fn(async (_u: string, _s: string, a: { outcome: GeofenceOutcome; distanceMeters: number | null }) => {
      recorded.push(a);
      return { ...a, attemptedAt: NOW };
    }),
  };
  const places = { distanceTo: vi.fn().mockResolvedValue(opts.distance === undefined ? 42 : opts.distance) };
  const consent = { allowsGeolocation: vi.fn().mockResolvedValue(opts.consent ?? true) };
  const check = new GeofenceCheck(attempts, places, consent);
  const qr = new QrCodeValidator(tokens);
  const completions = {
    listFor: vi.fn().mockResolvedValue((opts.done ?? []).map((stepId) => ({ stepId, completedAt: NOW }))),
    complete: vi.fn().mockResolvedValue({ recorded: true, missionCompleted: false }),
  };
  const bus = { publish: vi.fn().mockResolvedValue(undefined) };
  const completeStep = new CompleteStep(
    { findByStepId: vi.fn(async (id: string) => (m.steps.some((s) => s.id === id) ? m : null)) },
    { find: vi.fn().mockResolvedValue({ id: "um1", userId: "ana", missionId: "m1", status: "active", acceptedAt: NOW, completedAt: null }) },
    completions,
    [qr, new GeofenceValidator(check), new QrAndGeofenceValidator(qr, check)],
    bus,
    now,
  );
  return { checkIn: new GeofenceCheckIn(completeStep), qrFlow: new QrStepValidation(tokens, completeStep), attempts, recorded, places, completions, bus, consent };
}

const input = (patch: Partial<{ stepId: string; accuracy: number }> = {}) => ({ stepId: S1, lat: -26.3045, lon: -48.8456, accuracy: 15, ...patch });

describe("regras puras do geofence", () => {
  it("permanência conta desde o primeiro check-in dentro da sequência atual", () => {
    expect(dwellStatus([attempt("inside", 3), attempt("inside", 0)], NOW, 2)).toEqual({ satisfied: true });
    expect(dwellStatus([attempt("inside", 1), attempt("inside", 0)], NOW, 2)).toEqual({ satisfied: false, minutesLeft: 1 });
    expect(dwellStatus([attempt("inside", 0)], NOW, 5)).toEqual({ satisfied: false, minutesLeft: 5 });
  });

  it("sair do raio zera a permanência; leitura imprecisa não conta; check-in velho não vale", () => {
    expect(dwellStatus([attempt("inside", 10), attempt("outside", 5), attempt("inside", 0)], NOW, 2)).toEqual({ satisfied: false, minutesLeft: 2 });
    expect(dwellStatus([attempt("inaccurate", 10), attempt("inside", 0)], NOW, 2)).toEqual({ satisfied: false, minutesLeft: 2 });
    expect(dwellStatus([attempt("inside", 60), attempt("inside", 0)], NOW, 2)).toEqual({ satisfied: false, minutesLeft: 2 });
  });

  it("sem permanência exigida, chegar basta", () => {
    expect(dwellStatus([], NOW, 0)).toEqual({ satisfied: true });
  });

  it("distância arredondada para 10 m e geofence efetiva por tipo", () => {
    expect(roundDistance(44)).toBe(40);
    expect(roundDistance(46)).toBe(50);
    expect(geofenceFor("qr", { radiusMeters: 50, dwellMinutes: 3 })).toBeNull();
    expect(geofenceFor("gps", null)).toEqual({ radiusMeters: 100, dwellMinutes: 2 });
    expect(geofenceFor("qr_gps", { radiusMeters: 50, dwellMinutes: 3 })).toEqual({ radiusMeters: 50, dwellMinutes: 0 });
  });

  it("recompensa real só em missões em que toda etapa exige o QR", () => {
    expect(allowsRealReward(mission([gpsStep({ validation: "qr", geofence: null })]))).toBe(true);
    expect(allowsRealReward(mission([gpsStep({ validation: "qr_gps" })]))).toBe(true);
    expect(allowsRealReward(mission([gpsStep({ validation: "qr", geofence: null }), gpsStep({ id: S2, position: 2 })]))).toBe(false);
  });
});

describe("check-in por GPS (GeofenceValidator via CompleteStep)", () => {
  it("dentro do raio e depois da permanência: conclui a etapa e publica o XP", async () => {
    const { checkIn, completions, bus, recorded, places } = setup({ previous: [attempt("inside", 3)] });
    const res = await checkIn.execute("ana", input());
    expect(res.ok && res.value).toMatchObject({ status: "completed", missionId: "m1", stepId: S1, xp: 30 });
    expect(places.distanceTo).toHaveBeenCalledWith(fix(), "palmeiras");
    // Grava só o resultado e a distância arredondada: nunca a coordenada.
    expect(recorded).toEqual([{ outcome: "inside", distanceMeters: 40 }]);
    expect(completions.complete).toHaveBeenCalledWith("ana", "um1", S1);
    expect(bus.publish).toHaveBeenCalledWith("missions.StepCompleted", { userId: "ana", missionId: "m1", stepId: S1, xp: 30 });
  });

  it("primeiro check-in dentro do raio: pede para ficar por perto, sem concluir", async () => {
    const { checkIn, completions, bus } = setup();
    const res = await checkIn.execute("ana", input());
    expect(res.ok && res.value).toEqual({ status: "dwell", missionId: "m1", stepId: S1, minutesLeft: 2 });
    expect(completions.complete).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("sem permanência exigida, conclui no primeiro check-in", async () => {
    const { checkIn } = setup({ m: mission([gpsStep({ geofence: { radiusMeters: 50, dwellMinutes: 0 } })]) });
    const res = await checkIn.execute("ana", input());
    expect(res.ok && res.value.status).toBe("completed");
  });

  it("fora do raio: recusa, informa a distância arredondada e registra a tentativa", async () => {
    const { checkIn, recorded, completions } = setup({ distance: 457 });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error.code).toBe("outside_geofence");
    expect(!res.ok && res.error.message).toContain("cerca de 460 m");
    expect(recorded).toEqual([{ outcome: "outside", distanceMeters: 460 }]);
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it("precisão ruim é recusada sem nem calcular a distância", async () => {
    const { checkIn, recorded, places } = setup();
    const res = await checkIn.execute("ana", input({ accuracy: 250 }));
    expect(!res.ok && res.error.code).toBe("gps_inaccurate");
    expect(recorded).toEqual([{ outcome: "inaccurate", distanceMeters: null }]);
    expect(places.distanceTo).not.toHaveBeenCalled();
  });

  it("limite de tentativas por etapa e pessoa: recusa sem gravar mais", async () => {
    const previous = Array.from({ length: GEOFENCE_ATTEMPTS.max }, (_, i) => attempt("outside", i + 1));
    const { checkIn, attempts, places } = setup({ previous });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error.code).toBe("too_many_checkins");
    expect(attempts.record).not.toHaveBeenCalled();
    expect(places.distanceTo).not.toHaveBeenCalled();
  });

  it("consentimento de localização desligado: recusa sem registrar nada", async () => {
    const { checkIn, attempts } = setup({ consent: false });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error.code).toBe("geolocation_disabled");
    expect(attempts.recent).not.toHaveBeenCalled();
    expect(attempts.record).not.toHaveBeenCalled();
  });

  it("etapas em ordem, como no QR", async () => {
    const { checkIn, completions } = setup({ previous: [attempt("inside", 5)] });
    const res = await checkIn.execute("ana", input({ stepId: S2 }));
    expect(!res.ok && res.error.code).toBe("step_out_of_order");
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it("etapa já concluída não credita de novo", async () => {
    const { checkIn, completions } = setup({ previous: [attempt("inside", 5)], done: [S1] });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error).toMatchObject({ code: "step_already_completed", message: "Você já concluiu esta etapa." });
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it("etapa de QR não aceita check-in por GPS", async () => {
    const { checkIn } = setup({ m: mission([gpsStep({ validation: "qr", geofence: null })]) });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error.code).toBe("qr_invalid");
  });
});

describe("etapa QR + GPS", () => {
  const qrGps = () => mission([gpsStep({ validation: "qr_gps", geofence: { radiusMeters: 50, dwellMinutes: 0 } })]);
  const token = () => tokens.sign(S1, new Date(NOW.getTime() + 5 * 60_000));

  it("prévia do link do QR (GET) confere só o QR e não registra tentativa", async () => {
    const { qrFlow, attempts } = setup({ m: qrGps() });
    const res = await qrFlow.check("ana", token());
    expect(res.ok).toBe(true);
    expect(attempts.record).not.toHaveBeenCalled();
  });

  it("concluir sem a localização é recusado", async () => {
    const { qrFlow, completions } = setup({ m: qrGps() });
    const res = await qrFlow.execute("ana", token());
    expect(!res.ok && res.error.code).toBe("gps_required");
    expect(completions.complete).not.toHaveBeenCalled();
  });

  it("QR válido + no raio conclui; QR válido longe do lugar (foto repassada) é recusado", async () => {
    expect((await setup({ m: qrGps() }).qrFlow.execute("ana", token(), fix())).ok).toBe(true);
    const longe = await setup({ m: qrGps(), distance: 3000 }).qrFlow.execute("ana", token(), fix());
    expect(!longe.ok && longe.error.code).toBe("outside_geofence");
  });

  it("GPS sem QR não basta", async () => {
    const { checkIn } = setup({ m: qrGps() });
    const res = await checkIn.execute("ana", input());
    expect(!res.ok && res.error.code).toBe("qr_required");
  });
});

describe("validação de entrada", () => {
  it("check-in: arredonda a coordenada e exige a área atendida", () => {
    const ok = geofenceCheckInSchema.safeParse({ stepId: S1, lat: "-26.304567", lon: "-48.845612", accuracy: "12.5" });
    expect(ok.success && ok.data).toEqual({ stepId: S1, lat: -26.3046, lon: -48.8456, accuracy: 12.5 });
    expect(geofenceCheckInSchema.safeParse({ stepId: S1, lat: "-23.55", lon: "-46.63", accuracy: "10" }).success).toBe(false);
    expect(geofenceCheckInSchema.safeParse({ stepId: "x", lat: "-26.3", lon: "-48.8", accuracy: "10" }).success).toBe(false);
    expect(geofenceCheckInSchema.safeParse({ stepId: S1, lat: "-26.3", lon: "-48.8", accuracy: "-1" }).success).toBe(false);
  });

  it("confirmação do QR: posição opcional, mas, se vier, precisa ser válida", () => {
    expect(completeStepSchema.parse({ token: "abc" })).toEqual({ token: "abc", fix: null });
    expect(completeStepSchema.parse({ token: "abc", lat: "-26.3", lon: "-48.8", accuracy: "20" })).toEqual({ token: "abc", fix: { lat: -26.3, lon: -48.8, accuracyMeters: 20 } });
    expect(completeStepSchema.safeParse({ token: "abc", lat: "0", lon: "0", accuracy: "20" }).success).toBe(false);
  });
});
