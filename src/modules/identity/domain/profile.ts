export type Profile = { displayName: string; avatarPath: string | null };

export interface ProfileRepository {
  find(userId: string): Promise<Profile | null>;
  updateDisplayName(userId: string, displayName: string): Promise<void>;
  /** Troca a foto e devolve o caminho anterior (para apagar o arquivo antigo). */
  replaceAvatar(userId: string, avatarPath: string): Promise<string | null>;
}
