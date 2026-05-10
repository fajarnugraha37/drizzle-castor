import { executionContextStorage } from "./execution-context";
import type { AnyDatabase, AnyTable, ExecutionContext } from "../types";
import { assertSafeKey } from "../helper/assert-helper";
import { defaultTraceIdGenerator } from "../helper/context-helper";
import { logger } from "../helper/logger-helper";

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
  const parent = executionContextStorage.getStore() as
    | ExecutionContext<TDb, TTables, TMetadata, TState>
    | undefined;

  const traceId = parent?.traceId ?? (await traceIdGenerator());
  const spanId = await traceIdGenerator(); // Generate a new spanId for this execution context

  // Explicit mapping to avoid shallow copy/spread issues and ensure immutability of structure
  // Metadata and transaction status are inherited from parent if it exists
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
    isInTransaction: data.isInTransaction || (parent?.isInTransaction ?? false),
    translatorContext: {
      ...(data.translatorContext || {}),
      // CRITICAL FIX: Smart handle prioritization.
      // 1. If parent is already in a transaction, and this span is NOT explicitly starting a NEW transaction (isInTransaction is not true in data),
      //    we MUST inherit the parent's transaction handle to ensure stale repositories (created outside) join the active transaction.
      // 2. Otherwise, use the provided handle (which could be a NEW transaction handle from withTransaction, or the root DB).
      db: (parent?.isInTransaction && !data.isInTransaction) ? parent.translatorContext.db : data.translatorContext?.db,
    } as any,
    // CRITICAL: state must be a reference to the same object across the entire trace
    // to allow middleware to share data persistently across nested spans.
    state: parent ? parent.state : ((data as any).state || {}) as TState,
  };
  (context as any)._startPerfTime = performance.now();

  return executionContextStorage.run(context, () => fn(context));
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
  const store = executionContextStorage.getStore();
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
  return executionContextStorage.getStore();
}

/**
 * Updates the current context's metadata.
 */
export function updateContextMetadata(metadata: Record<string, any>): void {
  const store = executionContextStorage.getStore();
  if (store) {
    for (const key of Object.keys(metadata)) {
      assertSafeKey(key, "updateContextMetadata");
      Object.assign(store.metadata as any, { [key]: metadata[key] });
    }
  }
}

/**
 * Finalizes the current ExecutionContext.
 * Sets endTime, calculates duration, updates status, and dispatches to telemetry subscribers.
 */
export function endExecutionContext(status: "success" | "failed", error?: any): void {
  const store = executionContextStorage.getStore();
  if (store) {
    store.endTime = Date.now();
    const startPerfTime = (store as any)._startPerfTime;
    if (startPerfTime) {
      store.duration = performance.now() - startPerfTime;
    } else {
      store.duration = store.endTime - store.startTime;
    }
    store.status = status;
    if (error) store.error = error;

    // --- NEW: Emit structured events via mitt ---
    const emitter = store.translatorContext?.emitter;
    if (emitter) {
      const payload = {
        tableName: store.tableName,
        action: store.action,
        profile: store.profile,
        params: store.params,
        duration: store.duration!,
        status: status as any,
        error: store.error,
        traceId: store.traceId,
        spanId: store.spanId,
      };

      // Asynchronous emission
      Promise.resolve().then(() => {
        emitter.emit("execution", payload);
        if (status === "failed") {
          emitter.emit("error", {
            error: store.error,
            tableName: store.tableName,
            action: store.action,
            traceId: store.traceId,
          });
        }
      });
    }

    // Dispatch to legacy subscribers asynchronously
    const subscribers = store.translatorContext?.telemetrySubscribers;
    if (subscribers && subscribers.size > 0) {
       // Shallow clone to freeze the final state for telemetry, preventing accidental
       // delayed mutations by garbage collection artifacts.
       const snapshot = { ...store };
       
       for (const subscriber of subscribers) {
          // Use Promise.resolve().then() to schedule on the microtask queue, 
          // allowing the current stack to finish immediately.
          Promise.resolve().then(async () => {
            try {
              await subscriber(snapshot);
            } catch (err) {
              logger.error("Telemetry Error, subscriber failed:", err);
            }
          });
       }
    }
  }
}
