import { z } from "zod";
import { ForbiddenError, err, ok, type DomainError, type Result } from "@/shared/kernel";
import type { MissionStatus } from "../../domain/mission";

export const ADMIN_MISSIONS_LIMIT = 50;

export const adminMissionsSchema = z.object({ q: z.string().trim().max(80).catch("") });

/** Linha da lista do backoffice: todas as missões, inclusive encerradas e de parceiro suspenso. */
export type AdminMissionItem = { id: string; title: string; status: MissionStatus; startsAt: Date; endsAt: Date; ownerId: string; surprise: boolean };

export interface MissionAdminReader {
  /** Missões cujo título contém o texto (vazio = todas), da mais recente para a mais antiga. */
  searchAll(text: string, limit: number): Promise<AdminMissionItem[]>;
}

/** Backoffice (#142): admin lista e busca qualquer missão. O papel é conferido aqui também. */
export class ListMissionsForAdmin {
  constructor(private readonly missions: MissionAdminReader) {}

  async execute(viewer: { isAdmin: boolean }, text: string): Promise<Result<AdminMissionItem[], DomainError>> {
    if (!viewer.isAdmin) return err(new ForbiddenError());
    return ok(await this.missions.searchAll(adminMissionsSchema.parse({ q: text }).q, ADMIN_MISSIONS_LIMIT));
  }
}
