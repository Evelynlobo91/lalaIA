import { asUser } from "@/shared/db/as-user";
import type { Sql } from "@/shared/db/sql";
import type { PrivacyAgreement, PrivacyAgreements } from "../domain/privacy";

type Row = { guidelines_version: string; privacy_ack_at: Date };
const toAgreement = (r: Row): PrivacyAgreement => ({ version: r.guidelines_version, acceptedAt: r.privacy_ack_at });

/** Aceite das diretrizes em `live.broadcaster_agreements` (RLS: cada parceiro lê e grava só o próprio). */
export class PostgresPrivacyAgreements implements PrivacyAgreements {
  constructor(private readonly sql: Sql) {}

  async find(userId: string): Promise<PrivacyAgreement | null> {
    // Backend: confere o aceite do dono também quando um admin ativa a transmissão dele.
    const [row] = await this.sql<Row[]>`select guidelines_version, privacy_ack_at from live.broadcaster_agreements where owner_id = ${userId}`;
    return row ? toAgreement(row) : null;
  }

  async accept(userId: string, version: string): Promise<PrivacyAgreement | null> {
    try {
      const [row] = await asUser(
        userId,
        (tx) => tx<Row[]>`
          insert into live.broadcaster_agreements (owner_id, guidelines_version, privacy_ack_at)
          values (${userId}, ${version}, now())
          on conflict (owner_id) do update set guidelines_version = excluded.guidelines_version, privacy_ack_at = excluded.privacy_ack_at
          returning guidelines_version, privacy_ack_at`,
        this.sql,
      );
      return row ? toAgreement(row) : null;
    } catch (error) {
      // RLS: quem não é parceiro não registra aceite.
      if ((error as { code?: string }).code === "42501") return null;
      throw error;
    }
  }
}
