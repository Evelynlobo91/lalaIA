/**
 * Cria a dependência só no primeiro uso e reaproveita depois. Usado na composição
 * (`index.ts` do módulo) para não abrir conexões nem ler env no import.
 */
export function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined;
  let created = false;
  return () => {
    if (!created) {
      instance = factory();
      created = true;
    }
    return instance as T;
  };
}
