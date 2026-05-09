import { HookError } from "../errors";
import { findBaseTable, getPrimaryKeyColumnName } from "../helper";
import { getTableMetadataConfig } from "../helper/config-helper";
import type { AnyDatabase, AnyTable, TableHooks, TSchemaContext, Middleware } from "../types";

export function createHooksMiddleware<
  T = any, 
  TDb extends AnyDatabase = any, 
  TTables extends readonly AnyTable[] = any,
  TSchema extends TSchemaContext<TDb, TTables> = any,
  THooks extends TableHooks<TSchema, string> = any,
>(): Middleware<T, TDb, TTables> {
  return async (ctx, next) => {
    const { action, tableName, params, translatorContext } = ctx;
    const tables = translatorContext.tables;
    const tableConfig = getTableMetadataConfig(translatorContext, tableName);
    const hooks = tableConfig?.hooks as THooks | undefined;

    if (!hooks) {
      return next();
    }
    // Resolve PK name for filter construction
    const baseTable = findBaseTable(tables, tableName);
    const pkName = getPrimaryKeyColumnName(baseTable);

    let hookName = "before";
    try {
      // --- BEFORE HOOKS ---
      switch (action) {
        case "create":
          hookName += "Create";
          if (hooks.beforeCreate) {
            await hooks.beforeCreate!(params.data, ctx);
          }
          break;
        case "read":
          hookName += "Search";
          if (hooks.beforeSearch && params.query) await hooks.beforeSearch!(params.query as any, ctx);
          break;
        case "update":
          hookName += "Update";
          if (hooks.beforeUpdate) await hooks.beforeUpdate!(params.set as any, params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
          break;
        case "softDelete":
          hookName += "SoftDelete";
          if (hooks.beforeSoftDelete) await hooks.beforeSoftDelete!(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
          break;
        case "restore":
          hookName += "Restore";
          if (hooks.beforeRestore) await hooks.beforeRestore!(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
          break;
        case "hardDelete":
          hookName += "HardDelete";
          if (hooks.beforeHardDelete) await hooks.beforeHardDelete!(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
          break;
      }
    } catch (err: any) {
      const errorMsg = `[Hook Error] ${hookName} on table '${tableName}' failed: ${err?.message || err}`;
      throw new HookError(errorMsg, { originalError: err });
    }

    // --- EXECUTE CORE ACTION ---
    const result = await next();

    hookName = "after";
    try {
      // --- AFTER HOOKS ---
      switch (action) {
        case "create":
          hookName += "Create";
          if (hooks.afterCreate) {
            await hooks.afterCreate!(result as any, ctx);
          }
          break;
        case "read":
          hookName += "Search";
          // SearchPage returns { data, meta }
          if (result && typeof result === "object" && "data" in result && "meta" in result) {
            if (hooks.afterSearch) 
              await hooks.afterSearch!(params.query as any, result.data as any, ctx);
          } else {
            if (hooks.afterSearch) 
                await hooks.afterSearch!(params.query as any, Array.isArray(result) ? result : (result ? [result] : []) as any, ctx);
          }
          break;
        case "update":
          hookName += "Update";
          if (hooks.afterUpdate) 
            await hooks.afterUpdate!(params.set as any, Array.isArray(result) ? result : (result ? [result] : []) as any, ctx);
          break;
        case "softDelete":
          hookName += "SoftDelete";
          // Only trigger hook if it returned entities (the new executor will attach hydrated entities to the context state if hooks exist)
          if (hooks.afterSoftDelete && ctx.state.affectedRecords) 
            await hooks.afterSoftDelete!(ctx.state.affectedRecords, ctx);
          break;
        case "restore":
          hookName += "Restore";
          if (hooks.afterRestore && ctx.state.affectedRecords) 
            await hooks.afterRestore!(ctx.state.affectedRecords, ctx);
          break;
        case "hardDelete":
          hookName += "HardDelete";
          if (hooks.afterHardDelete && ctx.state.affectedRecords) 
            await hooks.afterHardDelete!(ctx.state.affectedRecords, ctx);
          break;
      }
    } catch (err: any) {
      const errorMsg = `[Hook Error] ${hookName} on table '${tableName}' failed: ${err?.message || err}`;
      throw new HookError(errorMsg, { originalError: err });
    }

    return result;
  };
}
