import { executeCreateOne, executeCreateMany } from "./mutations/create";
import { executeUpdateOne, executeUpdateMany } from "./mutations/update";
import { executeSearchOne, executeSearchPage, executeSearchMany, executeSearchDeletedOne, executeSearchDeletedPage, executeSearchDeletedMany } from "./queries";
import { executeHardDeleteOne, executeHardDeleteMany } from "./mutations/delete";
import { executeSoftDeleteOne, executeSoftDeleteMany } from "./mutations/soft-delete";
import { executeRestoreOne, executeRestoreMany } from "./mutations/restore";
import { findBaseTable } from "./helper";
import type { AnyDatabase, TSchemaMetadata, TTableNames, TProfileOptions, Repository, TSchemaContext, DbAction, AnyTable, TraceIdGenerator } from "./types";
import { composeMiddleware, createFieldRbacMiddleware, createHooksMiddleware, createRbacMiddleware } from "./middleware/exports";
import type { Middleware, MiddlewareContext } from "./middleware/index";
import { runInContext, endExecutionContext } from "./context/manager";

export function defineSchemaMetadata<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(
  db: TDb, 
  tables: TTables, 
  mode: "strict" | "lenient" = "lenient",
  globalMiddlewares: Middleware[] = [],
  isThrowError: boolean = false,
  traceIdGenerator?: TraceIdGenerator
) {
  if (mode === "lenient") {
    console.warn(
      "[Drizzle-Castor] Warning: Running in lenient mode. Unprotected tables will allow all actions by default.",
    );
  }

  const hooksMiddleware = createHooksMiddleware();
  const tableRbacMiddleware = createRbacMiddleware(mode);

  return function <const TMetadata extends TSchemaMetadata<TDb, TTables>>(
    metadata: TMetadata,
  ) {
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
      };

      const tableConfig = (metadata as any)[tableName] || {};
      const tableMiddlewares = tableConfig.middlewares || [];
      
      const fieldRbacMiddleware = createFieldRbacMiddleware(options as any, mode, isThrowError);

      // Stack: Global -> Table Specific -> Hooks -> Table RBAC -> Field RBAC -> Core Action
      const pipeline = composeMiddleware([
        ...globalMiddlewares,
        ...tableMiddlewares,
        hooksMiddleware,
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
            db,
            schemaMetadata: metadata,
            translatorContext,
          },
          async () => {
            const ctx: MiddlewareContext = {
              action,
              tableName,
              profile,
              params,
              translatorContext,
              state: {},
            };

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
          return executeWithMiddleware("create", profile, { data }, (ctx: MiddlewareContext) => 
            executeCreateOne(ctx, baseTable)
          );
        },
        createMany: async (data, profile) => {
          return executeWithMiddleware("create", profile, { data }, (ctx: MiddlewareContext) => 
            executeCreateMany(ctx, baseTable)
          );
        },
        searchOne: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchOne(ctx)
          );
        },
        searchPage: async (query, profile) => {
          return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchPage(ctx)
          );
        },
        searchMany: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchMany(ctx)
          );
        },
        searchDeletedOne: async (query, profile) => {
          return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchDeletedOne(ctx)
          );
        },
        searchDeletedPage: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchDeletedPage(ctx)
          );
        },
        searchDeletedMany: async (query, profile) => {
           return executeWithMiddleware("read", profile, { query }, (ctx: MiddlewareContext) => 
            executeSearchDeletedMany(ctx)
          );
        },
        updateOne: async (id, set, profile) => {
           return executeWithMiddleware("update", profile, { id, set }, (ctx: MiddlewareContext) => 
            executeUpdateOne(ctx, baseTable)
          );
        },
        updateMany: async (filter, set, profile) => {
          return executeWithMiddleware("update", profile, { filter, set }, (ctx: MiddlewareContext) => 
            executeUpdateMany(ctx, baseTable)
          );
        },
        softDeleteOne: async (id, profile) => {
          return executeWithMiddleware("softDelete", profile, { id }, (ctx: MiddlewareContext) => 
            executeSoftDeleteOne(ctx, baseTable)
          );
        },
        softDeleteMany: async (filter, profile) => {
          return executeWithMiddleware("softDelete", profile, { filter }, (ctx: MiddlewareContext) => 
            executeSoftDeleteMany(ctx, baseTable)
          );
        },
        restoreOne: async (id, profile) => {
          return executeWithMiddleware("restore", profile, { id }, (ctx: MiddlewareContext) => 
            executeRestoreOne(ctx, baseTable)
          );
        },
        restoreMany: async (filter, profile) => {
          return executeWithMiddleware("restore", profile, { filter }, (ctx: MiddlewareContext) => 
            executeRestoreMany(ctx, baseTable)
          );
        },
        hardDeleteOne: async (id, profile) => {
           return executeWithMiddleware("hardDelete", profile, { id }, (ctx: MiddlewareContext) => 
            executeHardDeleteOne(ctx, baseTable)
          );
        },
        hardDeleteMany: async (filter, profile) => {
          return executeWithMiddleware("hardDelete", profile, { filter }, (ctx: MiddlewareContext) => 
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
    };
  };
}
