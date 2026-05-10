import { sql } from "drizzle-orm";
import { useExecutionContext, updateContextMetadata, runInContext } from "../context/manager";
import type { AnyDatabase, AnyTable, ExecutionContext, TransactionOptions } from "../types";
import { ConfigurationError } from "../errors";
import { logger } from "./logger-helper";
import { getDialect, executeRaw } from "./dialect-helper";

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
  return ctx.translatorContext.metadata[tableName] as T;
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
};

/**
 * Executes a block of code within a transaction handle, respecting the propagation rules.
 * This is used internally by executors to ensure atomicity.
 */
export async function withTransaction<T>(
  ctx: ExecutionContext,
  fn: (tx: any) => Promise<T>,
  options: TransactionOptions = { propagation: "REQUIRED" },
): Promise<T> {
  const { db } = ctx.translatorContext;
  const propagation = options.propagation || "REQUIRED";
  const isInActiveTransaction = ctx.isInTransaction || false;

  const dialect = getDialect(db);
  const isSQLite = dialect === "sqlite";

  logger.trace(`withTransaction: propagation=${propagation}, isInTransaction=${isInActiveTransaction}, dialect=${dialect}`);

  const executeInNewTransaction = async () => {
    // CRITICAL: Drizzle's BunSQLite and BetterSQLite3 drivers are synchronous.
    // When passed an async callback, they commit immediately because the promise is truthy.
    // We must manually manage BEGIN/COMMIT/ROLLBACK for SQLite to support async-first Castor.
    if (isSQLite) {
      const isNested = isInActiveTransaction;
      const spName = isNested ? `sp_${Date.now()}_${Math.floor(Math.random() * 1000)}` : null;
      
      const beginSql = spName ? sql`SAVEPOINT ${sql.identifier(spName)}` : sql`BEGIN TRANSACTION`;
      const commitSql = spName ? sql`RELEASE SAVEPOINT ${sql.identifier(spName)}` : sql`COMMIT`;
      const rollbackSql = spName ? sql`ROLLBACK TO SAVEPOINT ${sql.identifier(spName)}` : sql`ROLLBACK`;

      await executeRaw(db, beginSql);
      try {
        const res = await runInContext({
          action: ctx.action,
          tableName: ctx.tableName,
          profile: ctx.profile,
          params: ctx.params,
          metadata: ctx.metadata,
          isInTransaction: true,
          translatorContext: {
            ...ctx.translatorContext,
            db, // Reuse current handle as it's SQLite (one connection/locked)
          }
        }, () => fn(db));
        await executeRaw(db, commitSql);
        return res;
      } catch (e) {
        await executeRaw(db, rollbackSql);
        throw e;
      }
    }

    // For Async-capable drivers (PG, MySQL, LibSQL), use native Drizzle transactions
    return await db.transaction(async (tx: any) => {
      return await runInContext({
        action: ctx.action,
        tableName: ctx.tableName,
        profile: ctx.profile,
        params: ctx.params,
        metadata: ctx.metadata,
        isInTransaction: true,
        translatorContext: {
          ...ctx.translatorContext,
          db: tx,
        }
      }, () => fn(tx));
    }, options as any);
  };

  switch (propagation) {
    case "REQUIRED":
      if (isInActiveTransaction) {
        logger.trace("REQUIRED: Joining existing transaction");
        return await fn(db);
      }
      logger.trace("REQUIRED: Starting new transaction");
      return await executeInNewTransaction();

    case "REQUIRES_NEW":
      logger.trace("REQUIRES_NEW: Starting new transaction/savepoint");
      return await executeInNewTransaction();

    case "NESTED":
      logger.trace("NESTED: Starting nested transaction/savepoint");
      return await executeInNewTransaction();

    case "SUPPORTS":
      return await fn(db);

    case "MANDATORY":
      if (!isInActiveTransaction) {
        throw new ConfigurationError(
          "Transaction propagation 'MANDATORY' failed: No active transaction found in context.",
        );
      }
      return await fn(db);

    case "NEVER":
      if (isInActiveTransaction) {
        throw new ConfigurationError(
          "Transaction propagation 'NEVER' failed: Active transaction found in context.",
        );
      }
      return await fn(db);

    default:
      return await fn(db);
  }
}
