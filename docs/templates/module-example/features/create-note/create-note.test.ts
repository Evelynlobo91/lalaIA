import { describe, expect, it, vi } from "vitest";
import type { DomainEventPublisher } from "@/shared/events";
import { InMemoryNoteRepository } from "../../infra/in-memory-note-repository";
import { createNoteRoute } from "./create-note.route";
import { CreateNote } from "./create-note.use-case";

const publisher = (): DomainEventPublisher => ({ publish: vi.fn().mockResolvedValue(undefined) });

describe("CreateNote", () => {
  it("salva a nota e publica example.NoteCreated", async () => {
    const repo = new InMemoryNoteRepository();
    const events = publisher();
    const useCase = new CreateNote(repo, events, () => new Date("2026-01-01"), () => "n1");

    const result = await useCase.execute({ text: "Visitar o Museu do Sambaqui" });

    expect(result).toEqual({ ok: true, value: { id: "n1", text: "Visitar o Museu do Sambaqui", createdAt: new Date("2026-01-01") } });
    expect(repo.notes).toHaveLength(1);
    expect(events.publish).toHaveBeenCalledWith("example.NoteCreated", { noteId: "n1" });
  });

  it("recusa texto duplicado sem publicar evento", async () => {
    const repo = new InMemoryNoteRepository();
    const events = publisher();
    const useCase = new CreateNote(repo, events);
    await useCase.execute({ text: "Repetida" });
    vi.mocked(events.publish).mockClear();

    const result = await useCase.execute({ text: "Repetida" });

    expect(result.ok).toBe(false);
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe("rota POST de notas", () => {
  const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  const route = () => {
    const useCase = new CreateNote(new InMemoryNoteRepository(), publisher());
    return createNoteRoute(() => useCase);
  };

  it("cria com 201", async () => {
    expect((await route()(post({ text: "Ir ao Festival de Dança" }))).status).toBe(201);
  });

  it("rejeita texto vazio com 400", async () => {
    expect((await route()(post({ text: " " }))).status).toBe(400);
  });

  it("responde 409 para duplicada", async () => {
    const POST = route();
    await POST(post({ text: "Dup" }));
    expect((await POST(post({ text: "Dup" }))).status).toBe(409);
  });
});
