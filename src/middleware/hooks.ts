import type { Middleware } from "./index";

export function createHooksMiddleware(): Middleware {
  return async (ctx, next) => {
    const { action, tableName, translatorContext, params } = ctx;
    const hooks = (translatorContext.metadata as any)[tableName]?.hooks;

    if (!hooks) {
      return next();
    }

    // --- BEFORE HOOKS ---
    switch (action) {
      case "create":
        if (Array.isArray(params.data)) {
          if (hooks.beforeCreateMany) {
            await hooks.beforeCreateMany(params.data);
          } else if (hooks.beforeCreate) {
            for (let i = 0; i < params.data.length; i++) {
              await hooks.beforeCreate(params.data[i]);
            }
          }
        } else {
          if (hooks.beforeCreate) await hooks.beforeCreate(params.data);
        }
        break;
      case "read":
        if (hooks.beforeSearch) await hooks.beforeSearch(params.query);
        break;
      case "update":
        if (hooks.beforeUpdate) await hooks.beforeUpdate(params.set, params.id ? { id: { $eq: params.id } } : params.filter);
        break;
      case "softDelete":
        if (hooks.beforeSoftDelete) await hooks.beforeSoftDelete(params.id ? { id: { $eq: params.id } } : params.filter);
        break;
      case "restore":
        if (hooks.beforeRestore) await hooks.beforeRestore(params.id ? { id: { $eq: params.id } } : params.filter);
        break;
      case "hardDelete":
        if (hooks.beforeHardDelete) await hooks.beforeHardDelete(params.id ? { id: { $eq: params.id } } : params.filter);
        break;
    }

    // --- EXECUTE CORE ACTION ---
    const result = await next();

    // --- AFTER HOOKS ---
    switch (action) {
      case "create":
        if (Array.isArray(result)) {
          if (hooks.afterCreateMany) {
            await hooks.afterCreateMany(result);
          } else if (hooks.afterCreate) {
            for (const record of result) {
              await hooks.afterCreate(record);
            }
          }
        } else {
          if (hooks.afterCreate) await hooks.afterCreate(result);
        }
        break;
      case "read":
        // SearchPage returns { data, meta }
        if (result && typeof result === "object" && "data" in result && "meta" in result) {
          if (hooks.afterSearch) await hooks.afterSearch(params.query, result.data);
        } else {
           if (hooks.afterSearch) await hooks.afterSearch(params.query, Array.isArray(result) ? result : (result ? [result] : []));
        }
        break;
      case "update":
         if (hooks.afterUpdate) await hooks.afterUpdate(params.set, Array.isArray(result) ? result : (result ? [result] : []));
         break;
      case "softDelete":
         // Only trigger hook if it returned entities (the new executor will attach hydrated entities to the context state if hooks exist)
         if (hooks.afterSoftDelete && ctx.state.affectedRecords) await hooks.afterSoftDelete(ctx.state.affectedRecords);
         break;
      case "restore":
         if (hooks.afterRestore && ctx.state.affectedRecords) await hooks.afterRestore(ctx.state.affectedRecords);
         break;
      case "hardDelete":
         if (hooks.afterHardDelete && ctx.state.affectedRecords) await hooks.afterHardDelete(ctx.state.affectedRecords);
         break;
    }

    return result;
  };
}
