// Erros de domínio. O mapeamento para HTTP fica num único lugar (shared/http/responses.ts).
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = "validation_failed";
}

export class UnauthorizedError extends DomainError {
  readonly code = "unauthorized";
  constructor(message = "Faça login para continuar.") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "forbidden";
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "not_found";
  constructor(resource: string) {
    super(`${resource} não encontrado.`);
  }
}

export class ConflictError extends DomainError {
  readonly code = "conflict";
}

/** Regra de negócio violada (ex.: missão expirada, QR já utilizado). */
export class BusinessRuleError extends DomainError {
  constructor(
    readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super(message, details);
  }
}
