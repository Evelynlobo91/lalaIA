"use client";

// UI do slice: apresentação e chamada à rota; nenhuma regra de negócio aqui.
export function CreateNoteForm({ action = "/api/notes" }: { action?: string }) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const text = new FormData(e.currentTarget).get("text");
        await fetch(action, { method: "POST", body: JSON.stringify({ text }) });
      }}
    >
      <input name="text" aria-label="Nota" className="rounded border px-2 py-1" />
      <button type="submit">Salvar</button>
    </form>
  );
}
