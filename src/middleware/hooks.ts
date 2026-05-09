import { findBaseTable, getPrimaryKeyColumnName } from "../helper";
import { getContext } from "../helper/context-helper";
import type { AnyDatabase, AnyTable, TableHooks, TSchemaContext } from "../types";
import type { Middleware } from "./index";

export function createHooksMiddleware<
  T = any, 
  TDb extends AnyDatabase = any, 
  TTables extends readonly AnyTable[] = any,
  TSchema extends TSchemaContext<TDb, TTables> = any,
  THooks extends TableHooks<TSchema, string> = any,
>(): Middleware<T, TDb, TTables> {
  return async (ctx, next) => {
    const { action, tableName, params } = ctx;
    const tables = ctx.translatorContext.tables;
    const hooks = (ctx.translatorContext.metadata as any)[tableName]?.hooks as THooks | undefined;

    if (!hooks) {
      return next();
    }

    const executionContext = getContext();

    // Resolve PK name for filter construction
    const baseTable = findBaseTable(tables, tableName);
    const pkName = getPrimaryKeyColumnName(baseTable);

    // --- BEFORE HOOKS ---
    switch (action) {
      case "create":
         if (hooks.beforeCreate) {
          await hooks.beforeCreate(params.data, executionContext);
        }
        break;
      case "read":
        if (hooks.beforeSearch) await hooks.beforeSearch(params.query as any, executionContext);
        break;
      case "update":
        if (hooks.beforeUpdate) await hooks.beforeUpdate(params.set as any, params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, executionContext);
        break;
      case "softDelete":
        if (hooks.beforeSoftDelete) await hooks.beforeSoftDelete(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, executionContext);
        break;
      case "restore":
        if (hooks.beforeRestore) await hooks.beforeRestore(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, executionContext);
        break;
      case "hardDelete":
        if (hooks.beforeHardDelete) await hooks.beforeHardDelete(params.id ? { [pkName]: { $eq: params.id } } : params.filter as any, executionContext);
        break;
    }

    // --- EXECUTE CORE ACTION ---
    const result = await next();

    // --- AFTER HOOKS ---
    switch (action) {
      case "create":
        if (hooks.afterCreate) {
          await hooks.afterCreate(result as any, executionContext);
        }
        break;
      case "read":
        // SearchPage returns { data, meta }
        if (result && typeof result === "object" && "data" in result && "meta" in result) {
          if (hooks.afterSearch) 
            await hooks.afterSearch(params.query as any, result.data as any, executionContext);
        } else {
           if (hooks.afterSearch) 
              await hooks.afterSearch(params.query as any, Array.isArray(result) ? result : (result ? [result] : []) as any, executionContext);
        }
        break;
      case "update":
         if (hooks.afterUpdate) 
          await hooks.afterUpdate(params.set as any, Array.isArray(result) ? result : (result ? [result] : []) as any, executionContext);
         break;
      case "softDelete":
         // Only trigger hook if it returned entities (the new executor will attach hydrated entities to the context state if hooks exist)
         if (hooks.afterSoftDelete && ctx.state.affectedRecords) 
          await hooks.afterSoftDelete(ctx.state.affectedRecords, executionContext);
         break;
      case "restore":
         if (hooks.afterRestore && ctx.state.affectedRecords) 
          await hooks.afterRestore(ctx.state.affectedRecords, executionContext);
         break;
      case "hardDelete":
         if (hooks.afterHardDelete && ctx.state.affectedRecords) 
          await hooks.afterHardDelete(ctx.state.affectedRecords, executionContext);
         break;
    }

    return result;
  };
}
