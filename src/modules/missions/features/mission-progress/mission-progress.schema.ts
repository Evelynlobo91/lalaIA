import { z } from "zod";

/** Id da missão vindo da URL (/missoes/[id]): inválido vira 404 sem consultar o banco. */
export const missionIdSchema = z.uuid();
