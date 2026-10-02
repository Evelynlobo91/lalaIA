import type { CategoryId } from "@/shared/catalog/categories";

/**
 * Tipos de experiência do formulário (#73): atalhos para grupos de categorias do catálogo.
 * "Algo diferente" não escolhe categorias: evita as de sempre (as preferidas do perfil).
 */
export const experienceTypes = [
  { id: "qualquer", label: "Qualquer coisa", categories: null },
  { id: "comer-beber", label: "Comer e beber", categories: ["restaurantes", "bares", "cafes"] },
  { id: "musica-festa", label: "Música e festa", categories: ["shows", "festas"] },
  { id: "cultura", label: "Cultura", categories: ["cultura", "exposicoes", "teatro"] },
  { id: "ar-livre", label: "Ar livre e esporte", categories: ["ar-livre", "esportes", "passeios"] },
  { id: "criancas", label: "Com crianças", categories: ["infantil", "ar-livre"] },
  { id: "compras", label: "Compras e feiras", categories: ["compras", "feiras"] },
  { id: "diferente", label: "Algo diferente", categories: null },
] as const satisfies ReadonlyArray<{ id: string; label: string; categories: readonly CategoryId[] | null }>;

export type ExperienceTypeId = (typeof experienceTypes)[number]["id"];

export const experienceTypeIds = experienceTypes.map((t) => t.id) as [ExperienceTypeId, ...ExperienceTypeId[]];

export const experienceType = (id: ExperienceTypeId) => experienceTypes.find((t) => t.id === id)!;

/** Opções de tempo disponível (min). */
export const timeOptions = [60, 120, 180, 240, 360] as const;
/** Opções de orçamento total do grupo (R$); `null` = sem limite. */
export const budgetChoices = [0, 30, 50, 70, 100, 200, null] as const;
/** Opções de quantidade de pessoas. */
export const peopleOptions = [1, 2, 3, 4, 6] as const;

export const DEFAULT_TIME_MINUTES = 120;

/** "Com quem sai" do perfil → quantas pessoas, por padrão. */
export const peopleByGroup = { sozinho: 1, casal: 2, amigos: 4, familia: 4 } as const;

export const timeLabel = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} h` : minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`);
export const budgetLabel = (reais: number | null) => (reais === null ? "Sem limite" : reais === 0 ? "Grátis" : `Até R$ ${reais}`);
export const peopleLabel = (n: number) => (n === 1 ? "Só eu" : `${n} pessoas`);
