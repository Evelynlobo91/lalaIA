// Níveis de exploração (#66, RF33): derivados do saldo de XP, nunca guardados como número somado.
// A tabela de níveis mora só aqui. Para mudar a curva ou os nomes, edite esta lista (ordem crescente de XP).

export type LevelDefinition = { level: number; name: string; minXp: number };

export const LEVELS: readonly LevelDefinition[] = [
  { level: 1, name: "Recém-chegado na Rua das Palmeiras", minXp: 0 },
  { level: 2, name: "Ciclista da Cidade das Bicicletas", minXp: 100 },
  { level: 3, name: "Florista da Festa das Flores", minXp: 250 },
  { level: 4, name: "Bailarino do Festival de Dança", minXp: 500 },
  { level: 5, name: "Navegador da Baía da Babitonga", minXp: 900 },
  { level: 6, name: "Desbravador da Serra Dona Francisca", minXp: 1400 },
  { level: 7, name: "Lenda da Cidade dos Príncipes", minXp: 2000 },
] as const;

export type LevelStatus = {
  level: number;
  name: string;
  xp: number;
  /** XP em que o nível atual começa. */
  minXp: number;
  /** Próximo nível, ou null no nível máximo. */
  next: LevelDefinition | null;
  /** Quanto falta para o próximo nível (0 no máximo). */
  remaining: number;
  /** Progresso dentro do nível atual, de 0 a 100 (100 no máximo). */
  percent: number;
};

/** Nível de um saldo de XP (função pura). XP negativo ou inválido conta como zero. */
export function levelFor(xp: number, table: readonly LevelDefinition[] = LEVELS): LevelStatus {
  const balance = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let index = 0;
  for (let i = 0; i < table.length; i++) if (table[i].minXp <= balance) index = i;
  const current = table[index];
  const next = table[index + 1] ?? null;
  const percent = next ? Math.floor(((balance - current.minXp) / (next.minXp - current.minXp)) * 100) : 100;
  return { level: current.level, name: current.name, xp: balance, minXp: current.minXp, next, remaining: next ? next.minXp - balance : 0, percent };
}

/** Definição de um nível pelo número (ex.: dica de conquista "Chegue ao nível 3"). */
export function levelDefinition(level: number, table: readonly LevelDefinition[] = LEVELS): LevelDefinition | null {
  return table.find((l) => l.level === level) ?? null;
}

export type LevelUp = { level: number; reachedAt: Date };

/** Registro dos níveis alcançados (append-only): um por usuário e nível, para publicar o evento uma vez só. */
export interface LevelUpRepository {
  /** `true` se gravou agora; `false` se o nível já tinha sido registrado (idempotente). */
  record(userId: string, level: number): Promise<boolean>;
  /** Último nível alcançado, como o próprio usuário (RLS). */
  latest(userId: string): Promise<LevelUp | null>;
}

/** Saldo de XP (leitura do livro-razão). */
export interface XpBalanceReader {
  balanceOf(userId: string): Promise<number>;
}
