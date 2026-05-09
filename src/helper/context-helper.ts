import { useExecutionContext, updateContextMetadata } from "../context/manager";
import type { ExecutionContext } from "../context/execution-context";
import type { AnyDatabase, AnyTable } from "../types";

/**
 * Shorthand to get the current ExecutionContext.
 * Use this in middleware or hooks to access trace info.
 */
export function getContext<
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
  TMetadata extends Record<string, any> = any,
  TState extends Record<string, any> = any,
>(): ExecutionContext<TDb, TTables, TMetadata, TState> {
  return useExecutionContext<TDb, TTables, TMetadata, TState>();
}

/**
 * Tags the current trace with custom business metadata.
 * Useful for tracking userId, sessionId, or other contextual info.
 */
export function setMetadata(key: string, value: any): void {
  updateContextMetadata({ [key]: value });
}

/**
 * Sets a state value for the current execution trace.
 * Internal state is not exported to logs by default but shared across middleware.
 */
export function setState<TState extends Record<string, any> = any>(
  key: keyof TState & string,
  value: TState[keyof TState & string],
): void {
  const ctx = useExecutionContext<any, any, any, TState>();
  ctx.state[key] = value;
}

/**
 * Gets a state value from the current execution trace.
 */
export function getState<T = any, TState extends Record<string, any> = any>(
  key: keyof TState & string,
): T | undefined {
  const ctx = useExecutionContext<any, any, any, TState>();
  return ctx.state[key] as unknown as T;
}

/**
 * Returns the schema metadata configuration for the table currently being processed.
 */
export function getSchemaConfig<T = any>(): T {
  const ctx = useExecutionContext();
  const tableName = ctx.tableName;
  return ctx.schemaMetadata[tableName] as T;
}

export const defaultTraceIdGenerator = (): string => {
  if (typeof crypto !== "undefined") {
    if (crypto.randomUUID)
      return crypto.randomUUID();
    if (crypto.getRandomValues)
      return Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  }
  
  // Fallback for older environments
  return Math.random().toString(36).substring(2);
}
