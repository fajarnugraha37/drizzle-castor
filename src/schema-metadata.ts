import { executeCreateOne, executeCreateMany } from "./mutations/create";
import { executeUpdateOne, executeUpdateMany } from "./mutations/update";
import { executeSearchOne, executeSearchPage, executeSearchMany, executeSearchDeletedOne, executeSearchDeletedPage, executeSearchDeletedMany } from "./queries";
import { executeHardDeleteOne, executeHardDeleteMany } from "./mutations/delete";
import { executeSoftDeleteOne, executeSoftDeleteMany } from "./mutations/soft-delete";
import { executeRestoreOne, executeRestoreMany } from "./mutations/restore";
import { findBaseTable } from "./helper";
import type { AnyDatabase, TSchemaMetadata, TTableNames, TProfileOptions, Repository, TSchemaContext, DbAction, AnyTable, TraceIdGenerator, Middleware, MiddlewareConfig } from "./types";
import { composeMiddleware, createFieldRbacMiddleware, createRbacMiddleware } from "./middleware";
import type { ExecutionContext } from "./types/context";
import { runInContext, endExecutionContext, useExecutionContext } from "./context/manager";

export function defineSchemaMetadata<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(
  db: TDb, 
  tables: TTables, 
  mode: "strict" | "lenient" = "lenient",
  registeredMiddlewares: { middleware: Middleware, config?: MiddlewareConfig<TTables> }[] = [],
  isThrowError: boolean = false,
  traceIdGenerator?: TraceIdGenerator
) {
  if (mode === "lenient") {
    console.warn(
      "[Drizzle-Castor] Warning: Running in lenient mode. Unprotected tables will allow all actions by default.",
    );
  }

  const tableRbacMiddleware = createRbacMiddleware(mode);

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
      TProfiles extends TProfileOptions<TDb, TTables, TMetadata, TName>,
    >(
      tableName: TName,
      options: TProfiles,
    ): Repository<
      TSchemaContext<TDb, TTables, TMetadata>,
      TName,
      TProfiles
    > => {
      const translatorContext = {
        db,
        tables,
        metadata,
        baseTableName: tableName,
        telemetrySubscribers,
      };
      
      const fieldRbacMiddleware = createFieldRbacMiddleware(options as any, mode, isThrowError);

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

      // Stack: Global & Table Middlewares -> Table RBAC -> Field RBAC -> Core Action
      const pipeline = composeMiddleware([
        ...applicableMiddlewares,
        tableRbacMiddleware,
        fieldRbacMiddleware
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

            try {
              const result = await pipeline(ctx, async () => {
                return coreFn(ctx);
              });
              endExecutionContext("success");
              return result;
            } catch (err) {
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
