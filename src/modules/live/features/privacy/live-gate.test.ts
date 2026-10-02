import { describe, expect, it, vi } from "vitest";
import { BusinessRuleError, err, ok } from "@/shared/kernel";
import { liveGateWith } from "./live-gate";

describe("trava da live: plano + diretrizes de privacidade (#152)", () => {
  it("plano com live e diretrizes aceitas: libera", async () => {
    const privacy = { check: vi.fn().mockResolvedValue(ok(true)) };
    const gate = liveGateWith(async () => true, privacy);
    expect((await gate.check("dono", "activate")).ok).toBe(true);
    expect(privacy.check).toHaveBeenCalledWith("dono", "activate");
  });

  it("plano sem live: recusa antes de olhar as diretrizes", async () => {
    const privacy = { check: vi.fn() };
    const entitled = vi.fn().mockResolvedValue(false);
    const result = await liveGateWith(entitled, privacy).check("dono", "provision");
    expect(!result.ok && result.error.code).toBe("plan_feature_required");
    expect(entitled).toHaveBeenCalledWith("dono");
    expect(privacy.check).not.toHaveBeenCalled();
  });

  it("plano com live, mas sem o aceite das diretrizes: vale a recusa das diretrizes", async () => {
    const privacy = { check: vi.fn().mockResolvedValue(err(new BusinessRuleError("privacy_guidelines_required", "Aceite as diretrizes."))) };
    const result = await liveGateWith(async () => true, privacy).check("dono", "activate");
    expect(!result.ok && result.error.code).toBe("privacy_guidelines_required");
  });
});
