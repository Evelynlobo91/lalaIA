import { describe, expect, it, vi } from "vitest";
import { InMemoryEventBus } from "./in-memory-event-bus";

// Mapa de eventos local ao teste: não polui o catálogo global do app.
type TestEvents = {
  "test.Happened": { n: number };
  "test.Other": { s: string };
};

const fixed = { now: () => new Date("2026-01-01T00:00:00Z"), newId: () => "evt-1" };

describe("InMemoryEventBus", () => {
  it("entrega o evento com id, tipo, data e payload aos assinantes do tipo", async () => {
    const bus = new InMemoryEventBus<TestEvents>(fixed);
    const handler = vi.fn();
    bus.subscribe("test.Happened", handler);

    await bus.publish("test.Happened", { n: 42 });

    expect(handler).toHaveBeenCalledWith({
      id: "evt-1",
      type: "test.Happened",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
      payload: { n: 42 },
    });
  });

  it("não entrega para assinantes de outros tipos", async () => {
    const bus = new InMemoryEventBus<TestEvents>(fixed);
    const other = vi.fn();
    bus.subscribe("test.Other", other);

    await bus.publish("test.Happened", { n: 1 });

    expect(other).not.toHaveBeenCalled();
  });

  it("entrega para vários assinantes e aguarda os assíncronos", async () => {
    const bus = new InMemoryEventBus<TestEvents>(fixed);
    const calls: string[] = [];
    bus.subscribe("test.Happened", async () => {
      await new Promise((r) => setTimeout(r, 5));
      calls.push("a");
    });
    bus.subscribe("test.Happened", () => {
      calls.push("b");
    });

    await bus.publish("test.Happened", { n: 1 });

    expect(calls.sort()).toEqual(["a", "b"]);
  });

  it("isola a falha de um assinante: publicação não falha, demais recebem e o erro é reportado", async () => {
    const onHandlerError = vi.fn();
    const bus = new InMemoryEventBus<TestEvents>({ ...fixed, onHandlerError });
    const ok = vi.fn();
    bus.subscribe("test.Happened", () => {
      throw new Error("analytics fora do ar");
    });
    bus.subscribe("test.Happened", ok);

    await expect(bus.publish("test.Happened", { n: 1 })).resolves.toBeUndefined();

    expect(ok).toHaveBeenCalledOnce();
    expect(onHandlerError).toHaveBeenCalledWith(expect.objectContaining({ message: "analytics fora do ar" }), expect.objectContaining({ type: "test.Happened" }));
  });

  it("permite cancelar a assinatura", async () => {
    const bus = new InMemoryEventBus<TestEvents>(fixed);
    const handler = vi.fn();
    const unsubscribe = bus.subscribe("test.Happened", handler);

    unsubscribe();
    await bus.publish("test.Happened", { n: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("publicar sem assinantes não faz nada", async () => {
    const bus = new InMemoryEventBus<TestEvents>(fixed);
    await expect(bus.publish("test.Other", { s: "x" })).resolves.toBeUndefined();
  });
});
