import { describe, expect, it } from "vitest";
import { InMemoryNoteRepository } from "../../infra/in-memory-note-repository";
import { createNoteRoute } from "./create-note.route";
import { CreateNote } from "./create-note.use-case";

describe("CreateNote", () => {
  it("salva a nota com id e data", async () => {
    const repo = new InMemoryNoteRepository();
    const useCase = new CreateNote(repo, () => new Date("2026-01-01"), () => "n1");

    const note = await useCase.execute({ text: "Visitar o Museu do Sambaqui" });

    expect(note).toEqual({ id: "n1", text: "Visitar o Museu do Sambaqui", createdAt: new Date("2026-01-01") });
    expect(repo.notes).toHaveLength(1);
  });

  it("rota rejeita texto vazio com 400", async () => {
    const POST = createNoteRoute(new CreateNote(new InMemoryNoteRepository()));
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ text: " " }) }));
    expect(res.status).toBe(400);
  });
});
