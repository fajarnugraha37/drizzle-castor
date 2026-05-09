import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext } from "../types/context";

/**
 * The internal storage for the ExecutionContext.
 * We use AsyncLocalStorage for implicit context propagation.
 */
export const executionContextStorage = new AsyncLocalStorage<ExecutionContext<any, any, any, any>>();
