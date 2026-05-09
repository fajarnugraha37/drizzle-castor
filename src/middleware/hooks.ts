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

    // --- BEFORE HOOKS ---
    switch (action) {
      case "create":
         if (hooks.beforeCreate) {
          await hooks.beforeCreate(params.data, ctx);
        }
        break;
      case "read":
        // Context holds generic SearchQuery<any>, but hooks expect strongly typed DbSearchQuery
        if (hooks.beforeSearch && params.query) await hooks.beforeSearch(params.query as any, ctx);
        break;
      case "update":
        if (hooks.beforeUpdate) await hooks.beforeUpdate(params.set as any, params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
        break;
      case "softDelete":
        if (hooks.beforeSoftDelete) await hooks.beforeSoftDelete(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
        break;
      case "restore":
        if (hooks.beforeRestore) await hooks.beforeRestore(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
        break;
      case "hardDelete":
        if (hooks.beforeHardDelete) await hooks.beforeHardDelete(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, ctx);
        break;
    }

    // --- EXECUTE CORE ACTION ---
    const result = await next();

    // --- AFTER HOOKS ---
    switch (action) {
      case "create":
        if (hooks.afterCreate) {
          await hooks.afterCreate(result as any, ctx);
        }
        break;
      case "read":
        // SearchPage returns { data, meta }
        if (result && typeof result === "object" && "data" in result && "meta" in result) {
          if (hooks.afterSearch) 
            await hooks.afterSearch(params.query as any, result.data as any, ctx);
        } else {
           if (hooks.afterSearch) 
              await hooks.afterSearch(params.query as any, Array.isArray(result) ? result : (result ? [result] : []) as any, ctx);
        }
        break;
      case "update":
         if (hooks.afterUpdate) 
          await hooks.afterUpdate(params.set as any, Array.isArray(result) ? result : (result ? [result] : []) as any, ctx);
         break;
      case "softDelete":
         // Only trigger hook if it returned entities (the new executor will attach hydrated entities to the context state if hooks exist)
         if (hooks.afterSoftDelete && ctx.state.affectedRecords) 
          await hooks.afterSoftDelete(ctx.state.affectedRecords, ctx);
         break;
      case "restore":
         if (hooks.afterRestore && ctx.state.affectedRecords) 
          await hooks.afterRestore(ctx.state.affectedRecords, ctx);
         break;
      case "hardDelete":
         if (hooks.afterHardDelete && ctx.state.affectedRecords) 
          await hooks.afterHardDelete(ctx.state.affectedRecords, ctx);
         break;
    }

    return result;
  };
}
