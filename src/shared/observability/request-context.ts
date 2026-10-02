import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { readonly requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Reaproveita o x-request-id de um proxy confiável se tiver formato válido; senão gera um novo. */
export function requestIdFrom(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
