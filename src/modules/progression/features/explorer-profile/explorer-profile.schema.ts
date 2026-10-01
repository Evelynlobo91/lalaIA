import { z } from "zod";

// O id vem sempre da sessão; mesmo assim, validado antes de consultar os outros módulos.
export const explorerProfileSchema = z.object({ userId: z.uuid() });
