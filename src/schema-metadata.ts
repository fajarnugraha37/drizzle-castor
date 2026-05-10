import { executeCreateOne, executeCreateMany } from "./mutations/create";
import { executeUpdateOne, executeUpdateMany } from "./mutations/update";
import { executeSearchOne, executeSearchPage, executeSearchMany, executeSearchDeletedOne, executeSearchDeletedPage, executeSearchDeletedMany } from "./queries";
import { executeHardDeleteOne, executeHardDeleteMany } from "./mutations/delete";
import { executeSoftDeleteOne, executeSoftDeleteMany } from "./mutations/soft-delete";
import { executeRestoreOne, executeRestoreMany } from "./mutations/restore";
import { findBaseTable } from "./helper";
import type { AnyDatabase, TSchemaMetadata, TTableNames, Repository, TSchemaContext, DbAction, AnyTable, TraceIdGenerator, Middleware, MiddlewareConfig, PolicyDefinition, GlobalPolicyDefinition, CastorEvents, LoggerConfig, CastorInstance } from "./types";
import { composeMiddleware } from "./middleware";
import { createUnifiedRbacMiddleware } from "./middleware/unified-rbac";
import type { ExecutionContext } from "./types/context";
import { runInContext, endExecutionContext, useExecutionContext } from "./context/manager";
import type { Emitter } from "mitt";
import { CastorLogger } from "./helper/logger-helper";

export function defineSchemaMetadata<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(
  db: TDb, 
  tables: TTables, 
  mode: "strict" | "lenient" = "lenient",
  registeredMiddlewares: { middleware: Middleware, config?: MiddlewareConfig<TTables> }[] = [],
  registeredPolicies: Map<string, PolicyDefinition<any, any, any>> = new Map(),
  globalPolicy: GlobalPolicyDefinition<any, any> | undefined = undefined,
  emitter?: Emitter<CastorEvents>,
  loggerConfig?: LoggerConfig,
  isThrowError: boolean = false,
  traceIdGenerator?: TraceIdGenerator
): <const TMetadata extends TSchemaMetadata<TDb, TTables>>(metadata: TMetadata) => CastorInstance<TDb, TTables, TMetadata> {
  const logger = new CastorLogger(loggerConfig);

  if (mode === "lenient") {
    logger.warn(
      "[Drizzle-Castor] Warning: Running in lenient mode. Unprotected tables will allow all actions by default.",
    );
  }

  return function <const TMetadata extends TSchemaMetadata<TDb, TTables>>(
    metadata: TMetadata,
  ) {
    const telemetrySubscribers = new Set<(ctx: any) => void | Promise<void>>();

    const subscribeToTelemetry = (subscriber: (ctx: ExecutionContext<any, any, any, any>) => void | Promise<void>) => {
      telemetrySubscribers.add(subscriber);
      return () => {
        telemetrySubscribers.delete(subscriber);
      };
    };

    const repoFactory = <
      TName extends TTableNames<TDb, TTables, TMetadata>,
    >(
      tableName: TName,
    ): Repository<
      TSchemaContext<TDb, TTables, TMetadata>,
      TName
    > => {
      logger.debug(`Creating repository for table '${tableName as string}'`);
      const translatorContext = {
        db,
        tables,
        metadata,
        baseTableName: tableName,
        telemetrySubscribers,
        emitter,
        logger,
      };
      
      let policyDef = registeredPolicies.get(tableName as string);
      
      if (!policyDef && globalPolicy) {
        policyDef = async (ctx: any, activeProfiles: string[]) => {
          return globalPolicy(ctx, tableName as string, activeProfiles);
        };
      }

      const unifiedRbacMiddleware = createUnifiedRbacMiddleware(policyDef, mode, isThrowError);

      const applicableMiddlewares: Middleware[] = [];

      for (const { middleware, config } of registeredMiddlewares) {
        // If config.tables is defined and doesn't include this table, skip it
        if (config?.tables) {
          const allowedTables = Array.isArray(config.tables) ? config.tables : [config.tables];
          if (!allowedTables.includes(tableName)) {
            continue;
          }
        }

        // Wrap middleware to conditionally execute based on action
        const wrappedMiddleware: Middleware = async (ctx, next) => {
          if (config?.actions) {
            const allowedActions = Array.isArray(config.actions) ? config.actions : [config.actions];
            if (!allowedActions.includes(ctx.action)) {
              return next();
            }
          }
          return middleware(ctx, next);
        };

        applicableMiddlewares.push(wrappedMiddleware);
      }

      // Stack: Global & Table Middlewares -> Unified RBAC -> Core Action
      const pipeline = composeMiddleware([
        ...applicableMiddlewares,
        unifiedRbacMiddleware
      ]);

      const baseTable = findBaseTable(tables, tableName);

      const executeWithMiddleware = (action: DbAction, profile: any, params: any, coreFn: any) => {
        return runInContext(
          {
            action,
            tableName,
            profile,
            params,
            metadata: {}, // Initial empty metadata
            translatorContext,
          },
          async () => {
            const ctx = useExecutionContext();
            logger.info(`Starting ${action} on ${tableName}`);
            logger.trace(`Operation params: %{params}`);

            try {
              const result = await pipeline(ctx, async () => {
                logger.debug(`Executing core database logic for ${action} on ${tableName}`);
                return coreFn(ctx);
              });
              logger.info(`Successfully completed ${action} on ${tableName} in %{duration}ms`);
              endExecutionContext("success");
              return result;
            } catch (err: any) {
              logger.error(`Failed execution of ${action} on ${tableName}: ${err.message}`, err);
              endExecutionContext("failed", err);
              throw err;
            }
          },
          traceIdGenerator
        );
      };

      return {
        // --- FACTORY METHODS ---
        defineFilter: (f) => f,
        defineProjection: (p) => p,
        defineQuery: (q) => q,
        defineUpdateSet: (s) => s,
        defineInsertValue: (i) => i,

        createOne: async (data, profile) => {
          return executeWithMiddleware("create", profile, { data }, (ctx: ExecutionContext) => 
            executeCreateOne(ctx, baseTable)
          );
        },
        createMany: async (data, profile) => {
          return executeWithMiddleware("create", profile, { data }, (ctx: ExecutionContext) => 
            executeCreateMany(ctx, baseTable)
          );
        },
        searchOne: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchOne(ctx)
          );
        },
        searchPage: async (query, profile) => {
          return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchPage(ctx)
          );
        },
        searchMany: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchMany(ctx)
          );
        },
        searchDeletedOne: async (query, profile) => {
          return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchDeletedOne(ctx)
          );
        },
        searchDeletedPage: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchDeletedPage(ctx)
          );
        },
        searchDeletedMany: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: ExecutionContext) => 
            executeSearchDeletedMany(ctx)
          );
        },
        updateOne: async (id, set, profile) => {
           return executeWithMiddleware("update", profile, { id, set }, (ctx: ExecutionContext) => 
            executeUpdateOne(ctx, baseTable)
          );
        },
        updateMany: async (filter, set, profile) => {
          return executeWithMiddleware("update", profile, { filter, set }, (ctx: ExecutionContext) => 
            executeUpdateMany(ctx, baseTable)
          );
        },
        softDeleteOne: async (id, profile) => {
          return executeWithMiddleware("softDelete", profile, { id }, (ctx: ExecutionContext) => 
            executeSoftDeleteOne(ctx, baseTable)
          );
        },
        softDeleteMany: async (filter, profile) => {
          return executeWithMiddleware("softDelete", profile, { filter }, (ctx: ExecutionContext) => 
            executeSoftDeleteMany(ctx, baseTable)
          );
        },
        restoreOne: async (id, profile) => {
          return executeWithMiddleware("restore", profile, { id }, (ctx: ExecutionContext) => 
            executeRestoreOne(ctx, baseTable)
          );
        },
        restoreMany: async (filter, profile) => {
          return executeWithMiddleware("restore", profile, { filter }, (ctx: ExecutionContext) => 
            executeRestoreMany(ctx, baseTable)
          );
        },
        hardDeleteOne: async (id, profile) => {
           return executeWithMiddleware("hardDelete", profile, { id }, (ctx: ExecutionContext) => 
            executeHardDeleteOne(ctx, baseTable)
          );
        },
        hardDeleteMany: async (filter, profile) => {
          return executeWithMiddleware("hardDelete", profile, { filter }, (ctx: ExecutionContext) => 
            executeHardDeleteMany(ctx, baseTable)
          );
        },
      };
    };

    return {
      db,
      tables,
      metadata,
      repoFactory,
      subscribeToTelemetry,
    };
  };
}
