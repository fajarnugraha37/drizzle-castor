import pino from "pino";
import type { LoggerConfig, LogLevel, ILogger } from "../types/logger";
import { executionContextStorage } from "../context/execution-context";

const DEFAULT_PATTERN = "%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %s%e%n";

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return "";
  
  // Supports both dot notation and array index notation (e.g. params.projection[0])
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalizedPath.split(".");
  
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return "";
    }
    current = current[part];
  }
  return current ?? "";
}

export class PatternFormatter {
  constructor(private pattern: string = DEFAULT_PATTERN) {}

  format(level: string, category: string, message: string, error?: any): string {
    const now = new Date();
    const ctx = this.getSafeContext();

    let output = this.pattern;

    // %d{format} - Date
    output = output.replace(/%d\{(.*?)\}/g, (_, fmt) => this.formatDate(now, fmt));
    
    // %p - Priority/Level
    output = output.replace(/%-?(\d*)p/g, (_, width) => {
      const p = level.toUpperCase();
      if (width) return p.padEnd(parseInt(width));
      return p;
    });

    // %c - Category
    output = output.replace(/%c/g, category);

    // %i - PID
    output = output.replace(/%i/g, process?.pid?.toString() || "0");

    // %t - Thread ID (using traceId as fallback for thread-like context in this library)
    output = output.replace(/%t/g, ctx?.traceId || "no-trace");

    // %z - Timezone
    output = output.replace(/%z/g, Intl.DateTimeFormat().resolvedOptions().timeZone);

    // %s - Message
    output = output.replace(/%s/g, message);

    // %e - Error stack
    output = output.replace(/%e/g, error ? `\n${error.stack || error.message || error}` : "");

    // %n - Newline
    output = output.replace(/%n/g, "\n");

    // %{key} - Context injection
    output = output.replace(/%\{(.*?)\}/g, (_, key) => {
      const val = getNestedValue(ctx, key);
      return typeof val === "object" ? JSON.stringify(val) : val.toString();
    });

    return output;
  }

  private getSafeContext() {
    try {
      return executionContextStorage.getStore();
    } catch {
      return null;
    }
  }

  private formatDate(date: Date, format: string): string {
    // Simple implementation of date formatting for common patterns
    const SSS = date.getMilliseconds().toString().padStart(3, "0");
    const yyyy = date.getFullYear().toString();
    const MM = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");
    const HH = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");

    return format
      .replace("yyyy", yyyy)
      .replace("MM", MM)
      .replace("dd", dd)
      .replace("HH", HH)
      .replace("mm", mm)
      .replace("ss", ss)
      .replace("SSS", SSS);
  }
}

export class CastorLogger implements ILogger {
  private pinoInstance: pino.Logger;
  private formatter: PatternFormatter;

  constructor(config: LoggerConfig = {}, private category: string = "castor.core") {
    const levelMap: Record<LogLevel, string> = {
      TRACE: "trace",
      DEBUG: "debug",
      INFO: "info",
      WARN: "warn",
      ERROR: "error",
      FATAL: "fatal",
      OFF: "silent",
    };

    this.formatter = new PatternFormatter(config.format);
    this.pinoInstance = pino({
      level: levelMap[config.level || "WARN"] || "warn",
      // We use pino as a container, but we want the formatted string output if compact
      // For now, we'll manually print to stdout to match the "compact" requirement
      // OR we can use a custom pino transport.
      // But for simplicity and direct control, we'll wrap it.
    });
  }

  private log(level: string, message: string, ...args: any[]) {
    if (!this.pinoInstance.isLevelEnabled(level)) return;

    let error: any = null;
    if (args.length > 0 && args[args.length - 1] instanceof Error) {
      error = args.pop();
    }

    // Process additional arguments
    let finalMessage = message;
    if (args.length > 0) {
      const stringifiedArgs = args.map(arg => 
        typeof arg === "object" ? JSON.stringify(arg) : String(arg)
      ).join(" ");
      finalMessage = `${message} ${stringifiedArgs}`;
    }

    const formatted = this.formatter.format(level, this.category, finalMessage, error);
    process.stdout.write(formatted);
  }

  trace(msg: string, ...args: any[]) { this.log("trace", msg, ...args); }
  debug(msg: string, ...args: any[]) { this.log("debug", msg, ...args); }
  info(msg: string, ...args: any[]) { this.log("info", msg, ...args); }
  warn(msg: string, ...args: any[]) { this.log("warn", msg, ...args); }
  error(msg: string, ...args: any[]) { this.log("error", msg, ...args); }
  fatal(msg: string, ...args: any[]) { this.log("fatal", msg, ...args); }

  child(category: string): CastorLogger {
    const child = new CastorLogger({}, `${this.category}.${category}`);
    child.formatter = this.formatter;
    child.pinoInstance = this.pinoInstance;
    return child;
  }
}

let internalLogger = new CastorLogger();

export const logger: ILogger = {
  trace: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).trace(msg, ...args),
  debug: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).debug(msg, ...args),
  info: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).info(msg, ...args),
  warn: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).warn(msg, ...args),
  error: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).error(msg, ...args),
  fatal: (msg, ...args) => (executionContextStorage.getStore()?.translatorContext?.logger || internalLogger).fatal(msg, ...args),
};

export function setGlobalLogger(config: LoggerConfig) {
  internalLogger = new CastorLogger(config);
}

export function getInternalLogger() {
  return internalLogger;
}
