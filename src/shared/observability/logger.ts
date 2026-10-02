import { redact } from "./redact";
import { currentRequestContext } from "./request-context";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Logger com campos fixos, ex.: `logger.child({ module: "places" })`. */
  child(bindings: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Options = {
  level?: LogLevel;
  bindings?: LogFields;
  write?: (line: string, level: LogLevel) => void;
  now?: () => Date;
};

const defaultWrite = (line: string, level: LogLevel) => (level === "error" || level === "warn" ? console.error(line) : console.log(line));

/** Logger estruturado (uma linha JSON por evento), com requestId automático e redação de dados sensíveis. */
export function createLogger(options: Options = {}): Logger {
  const minLevel = options.level ?? "info";
  const bindings = options.bindings ?? {};
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());

  const emit = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    const entry = {
      time: now().toISOString(),
      level,
      msg: message,
      ...currentRequestContext(),
      ...(redact({ ...bindings, ...fields }) as LogFields),
    };
    write(JSON.stringify(entry), level);
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (extra) => createLogger({ ...options, bindings: { ...bindings, ...extra } }),
  };
}

function levelFromEnv(): LogLevel {
  const value = process.env.LOG_LEVEL;
  if (value && value in ORDER) return value as LogLevel;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const globalForLogger = globalThis as unknown as { logger?: Logger };

/** Logger raiz do processo. Nos módulos, use `logger().child({ module: "<nome>" })`. */
export function logger(): Logger {
  globalForLogger.logger ??= createLogger({ level: levelFromEnv(), bindings: { service: "lalaia" } });
  return globalForLogger.logger;
}
