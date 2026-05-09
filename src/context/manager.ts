import { contextStorage, type ExecutionContext } from "./execution-context";
import type { AnyDatabase, AnyTable } from "../types";
import { assertSafeKey } from "../helper/assert-helper";
import { defaultTraceIdGenerator } from "../helper/context-helper";

/**
 * Runs a function within a new ExecutionContext.
 * Automatically handles parentId linking if a parent context exists.
 */
export async function runInContext<
  T,
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
  TMetadata extends Record<string, any> = any,
  TState extends Record<string, any> = any,
>(
  data: Omit<
    ExecutionContext<TDb, TTables, TMetadata, TState>,
    "traceId" | "spanId" | "parentId" | "startTime" | "state"
  >,
  fn: (ctx: ExecutionContext<TDb, TTables, TMetadata, TState>) => Promise<T>,
  traceIdGenerator: () => string | Promise<string> = defaultTraceIdGenerator,
): Promise<T> {
  const parent = contextStorage.getStore() as
    | ExecutionContext<TDb, TTables, TMetadata, TState>
    | undefined;

  const traceId = parent?.traceId ?? (await traceIdGenerator());
  const spanId = await traceIdGenerator(); // Generate a new spanId for this execution context

  // Explicit mapping to avoid shallow copy/spread issues and ensure immutability of structure
  // Metadata is inherited from parent if it exists
  const context: ExecutionContext<TDb, TTables, TMetadata, TState> = {
    traceId,
    spanId,
    parentId: parent?.spanId,
    startTime: Date.now(),
    status: "running",
    action: data.action,
    tableName: data.tableName,
    profile: data.profile,
    params: data.params ? { ...data.params } : {}, // Shallow clone of params object
    metadata: {
      ...(parent?.metadata || {}),
      ...(data.metadata || {}),
    } as TMetadata,
    db: data.db,
    schemaMetadata: data.schemaMetadata,
    translatorContext: data.translatorContext,
    state: {} as TState,
  };

  return contextStorage.run(context, () => fn(context));
}

/**
 * Retrieves the current ExecutionContext.
 * Throws if called outside of a context-managed execution.
 */
export function useExecutionContext<
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
  TMetadata extends Record<string, any> = any,
  TState extends Record<string, any> = any,
>(): ExecutionContext<TDb, TTables, TMetadata, TState> {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "[Drizzle-Castor] ExecutionContext not found. Ensure you are calling this within a Repository method.",
    );
  }
  return store as ExecutionContext<TDb, TTables, TMetadata, TState>;
}

/**
 * Safely tries to get the ExecutionContext. Returns undefined if not found.
 */
export function getExecutionContext(): ExecutionContext<any, any, any, any> | undefined {
  return contextStorage.getStore();
}

/**
 * Updates the current context's metadata.
 */
export function updateContextMetadata(metadata: Record<string, any>): void {
  const store = contextStorage.getStore();
  if (store) {
    for (const key of Object.keys(metadata)) {
      assertSafeKey(key, "updateContextMetadata");
      Object.assign(store.metadata as any, { [key]: metadata[key] });
    }
  }
}

/**
 * Finalizes the current ExecutionContext.
 * Sets endTime, calculates duration, and updates status.
 */
export function endExecutionContext(status: "success" | "failed", error?: any): void {
  const store = contextStorage.getStore();
  if (store) {
    store.endTime = Date.now();
    store.duration = store.endTime - store.startTime;
    store.status = status;
    if (error) store.error = error;
  }
}
