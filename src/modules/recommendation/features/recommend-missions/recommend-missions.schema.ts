// Mesmos parâmetros das sugestões (/sugestoes): tempo, orçamento, pessoas, tipo e localização opcional.
// Validação centralizada em rec-constraints.schema (uma regra só para as duas telas e as duas APIs).
export { constraintParamsSchema as recommendMissionsSchema, parseConstraintParams as parseMissionParams } from "../rec-constraints/rec-constraints.schema";
