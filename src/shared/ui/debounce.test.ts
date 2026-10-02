import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("só a última chamada vale, depois do intervalo sem digitar", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call("p");
    vi.advanceTimersByTime(200);
    d.call("pi");
    vi.advanceTimersByTime(200);
    d.call("piz");
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledExactlyOnceWith("piz");
  });

  it("cancel descarta a chamada pendente", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d.call("x");
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
