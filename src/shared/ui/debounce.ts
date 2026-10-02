import { useEffect, useState } from "react";

/** Adia `fn` até passar `ms` sem novas chamadas; só a última chamada vale. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(...args: A) {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}

/** Hook (componentes cliente): o valor só muda depois de `ms` sem alterações (ex.: o texto digitado). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const d = debounce(setDebounced, ms);
    d.call(value);
    return d.cancel;
  }, [value, ms]);
  return debounced;
}
