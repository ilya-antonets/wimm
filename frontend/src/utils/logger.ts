type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const configured = import.meta.env.VITE_LOG_LEVEL;
  if (configured && configured in LEVEL_ORDER) {
    return configured as LogLevel;
  }
  return import.meta.env.PROD ? "warn" : "debug";
}

const activeLevel = resolveLevel();

function enabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[activeLevel];
}

/** Level-controlled console wrapper. Controlled via `VITE_LOG_LEVEL`. */
export const logger = {
  debug: (...args: unknown[]): void => {
    if (enabled("debug")) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (enabled("info")) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (enabled("warn")) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (enabled("error")) console.error(...args);
  },
};
