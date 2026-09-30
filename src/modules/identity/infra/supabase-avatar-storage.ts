import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvatarStorage } from "../domain/avatar";

const BUCKET = "avatars";

/**
 * Usa o cliente com a sessão do próprio usuário: as políticas do Storage garantem
 * que ele só grava na própria pasta, mesmo que o código tenha algum erro de caminho.
 */
export class SupabaseAvatarStorage implements AvatarStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, bytes: Uint8Array, mime: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
    if (error) throw error;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }

  publicUrl(path: string): string {
    return this.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
}

/** URL pública sem precisar de cliente (usada ao exibir o perfil). */
export function avatarPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
