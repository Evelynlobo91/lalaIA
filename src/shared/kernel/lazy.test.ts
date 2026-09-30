import { describe, expect, it, vi } from "vitest";
import { lazy } from "./lazy";

describe("lazy", () => {
  it("só cria no primeiro uso e reaproveita a mesma instância", () => {
    const factory = vi.fn(() => ({ id: Math.random() }));
    const get = lazy(factory);

    expect(factory).not.toHaveBeenCalled();
    const a = get();
    const b = get();

    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledOnce();
  });
});
