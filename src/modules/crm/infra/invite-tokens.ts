import { createHash, randomBytes } from "node:crypto";
import type { InviteTokens } from "../domain/conversion";

/** Token de 32 bytes aleatórios em base64url (43 caracteres); no banco fica só o SHA-256. */
export const inviteTokens: InviteTokens = {
  generate() {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: this.hash(token) };
  },
  hash: (token) => createHash("sha256").update(token).digest("hex"),
};
