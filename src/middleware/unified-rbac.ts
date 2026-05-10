import { AccessDeniedError } from "../errors";
import { CONJUNCTION_OPERATORS } from "../types";
import type { Middleware, PolicyDefinition, UnifiedPolicyConfig } from "../types";
import { logger } from "../helper/logger-helper";

function isFieldAllowed(field: string, allowedSet: Set<string>): boolean {
  if (allowedSet.has("*")) return true;
  if (allowedSet.has(field)) return true;

  // For nested fields like `persona.skills.0`, check if parent `persona` or `persona.skills` is allowed
  const parts = field.split(".");
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}.${part}` : part;
    if (allowedSet.has(currentPath)) return true;
  }
  return false;
}

function trimFilterObj(filter: any, allowedSet: Set<string> | "*", ctx?: any): any {
  if (allowedSet === "*") return filter;
  if (!filter || typeof filter !== "object") return filter;
  if (Array.isArray(filter)) {
    const arr = filter.map(f => trimFilterObj(f, allowedSet, ctx)).filter(f => f !== undefined && Object.keys(f).length > 0);
    return arr.length > 0 ? arr : undefined;
  }

  const targetFilter: any = {};
  for (const [k, v] of Object.entries(filter)) {
    if ((CONJUNCTION_OPERATORS as readonly string[]).includes(k)) {
      const sub = trimFilterObj(v, allowedSet, ctx);
      if (sub !== undefined && Object.keys(sub).length > 0) {
        targetFilter[k] = sub;
      }
    } else if (k.startsWith("$")) {
      const msg = `[RBAC] Discarding unknown reserved keyword in filter: ${k}`;
      logger.warn(msg);
      if (ctx && ctx.state) {
        ctx.state.warnings = ctx.state.warnings || [];
        ctx.state.warnings.push(msg);
      }
      ctx.translatorContext.emitter?.emit("security", {
        type: "unknown_operator",
        tableName: ctx.tableName,
        message: msg,
        action: ctx.action
      });
    } else {
      if (isFieldAllowed(k, allowedSet)) {
        targetFilter[k] = v;
      } else {
        const msg = `[RBAC] Trimming unallowed field in filter: ${k}`;
        logger.warn(msg);
        if (ctx && ctx.state) {
          ctx.state.warnings = ctx.state.warnings || [];
          ctx.state.warnings.push(msg);
        }
        ctx.translatorContext.emitter?.emit("security", {
          type: "field_trim",
          tableName: ctx.tableName,
          fields: [k],
          message: msg,
          action: ctx.action
        });
      }
    }
  }

  return Object.keys(targetFilter).length > 0 ? targetFilter : undefined;
}

function handleFields(
  requestedFields: string[],
  allowedSet: Set<string> | "*" | null,
  isThrowError: boolean,
  actionName: string,
  ctx?: any
): string[] | undefined {
  if (allowedSet === "*") return requestedFields;
  const safeAllowed = allowedSet || new Set<string>();
  
  const allowed: string[] = [];
  const rejected: string[] = [];
  
  for (const f of requestedFields) {
    if (isFieldAllowed(f, safeAllowed)) allowed.push(f);
    else rejected.push(f);
  }
  
  if (rejected.length > 0) {
    const msg = isThrowError 
      ? `[Access Denied] Fields not allowed for ${actionName}: ${rejected.join(", ")}`
      : `[RBAC] Trimming unallowed fields for ${actionName}: ${rejected.join(", ")}`;
    
    if (isThrowError) {
      ctx.translatorContext.emitter?.emit("security", {
        type: "action_denied",
        tableName: ctx.tableName,
        message: msg,
        fields: rejected,
        action: ctx.action
      });
      throw new AccessDeniedError(msg);
    } else {
      logger.warn(msg);
      if (ctx && ctx.state) {
        ctx.state.warnings = ctx.state.warnings || [];
        ctx.state.warnings.push(msg);
      }
      ctx.translatorContext.emitter?.emit("security", {
        type: "field_trim",
        tableName: ctx.tableName,
        fields: rejected,
        message: msg,
        action: ctx.action
      });
    }
  }
  
  return allowed.length > 0 ? allowed : undefined;
}

export function createUnifiedRbacMiddleware(
  policyDef: PolicyDefinition<any, any, any> | undefined,
  mode: "strict" | "lenient",
  isThrowError: boolean,
): Middleware {
  return async (ctx, next) => {
    const { action, tableName, profile, params } = ctx;

    if (!policyDef) {
      if (mode === "lenient") return next();
      throw new AccessDeniedError(
        `[Access Denied] Table '${tableName}' has no policies defined in strict mode.`,
      );
    }

    const profilesToCheck = profile
      ? Array.isArray(profile)
        ? profile
        : [profile]
      : ["default"];

    if (profilesToCheck.length === 0) {
      profilesToCheck.push("default");
    }

    let resolvedConfig: UnifiedPolicyConfig<any, any>;

    if (typeof policyDef === "function") {
      resolvedConfig = await policyDef(ctx, profilesToCheck);
    } else {
      // It's a map. Merge allowed rules from matched profiles.
      let hasMatch = false;
      let missingProfiles: string[] = [];
      const mergedConfig: UnifiedPolicyConfig<any, any> = {
        allowedActions: [],
        allowedSets: undefined,
        allowedProjections: undefined,
        allowedFilters: undefined,
        allowedSorts: undefined
      };

      const mergeFieldConfig = (existing: any, incoming: any): any => {
        if (existing === "*" || incoming === "*") return "*";
        if (typeof existing === "function" || typeof incoming === "function") {
          return async (context: any) => {
            const res1 = typeof existing === "function" ? await existing(context) : existing;
            const res2 = typeof incoming === "function" ? await incoming(context) : incoming;
            if (res1 === "*" || res2 === "*") return "*";
            
            const isRes1Valid = Array.isArray(res1);
            const isRes2Valid = Array.isArray(res2);
            
            if (!isRes1Valid && !isRes2Valid) return null;
            
            const arr1 = isRes1Valid ? res1 : [];
            const arr2 = isRes2Valid ? res2 : [];
            return [...new Set([...arr1, ...arr2])];
          };
        }
        if (Array.isArray(existing) && Array.isArray(incoming)) {
          return [...new Set([...existing, ...incoming])];
        }
        return incoming || existing;
      };

      let actionWildcard = false;

      for (const profileName of profilesToCheck) {
        let pConfig = policyDef[profileName];
        if (!pConfig) {
          missingProfiles.push(profileName);
          continue;
        }
        
        if (typeof pConfig === "function") {
          pConfig = await pConfig(ctx);
        }

        hasMatch = true;

        if (pConfig.allowedActions === "*") actionWildcard = true;
        else if (Array.isArray(pConfig.allowedActions) && Array.isArray(mergedConfig.allowedActions)) {
          mergedConfig.allowedActions = [...new Set([...mergedConfig.allowedActions, ...pConfig.allowedActions])] as any;
        }

        mergedConfig.allowedSets = mergeFieldConfig(mergedConfig.allowedSets, pConfig.allowedSets);
        mergedConfig.allowedProjections = mergeFieldConfig(mergedConfig.allowedProjections, pConfig.allowedProjections);
        mergedConfig.allowedFilters = mergeFieldConfig(mergedConfig.allowedFilters, pConfig.allowedFilters);
        mergedConfig.allowedSorts = mergeFieldConfig(mergedConfig.allowedSorts, pConfig.allowedSorts);
      }

      if (!hasMatch) {
        const profileStr = profilesToCheck.join(", ");
        throw new AccessDeniedError(
          `[Access Denied] None of the profiles '${profileStr}' are defined for table '${tableName}'.`,
        );
      }

      if (actionWildcard) mergedConfig.allowedActions = "*";

      resolvedConfig = mergedConfig;
    }

    // --- 1. TABLE RBAC (Action Check) ---
    if (resolvedConfig.allowedActions !== "*") {
      const allowedActions = resolvedConfig.allowedActions || [];
      if (!allowedActions.includes(action)) {
        const profileStr = profilesToCheck.join(", ");
        throw new AccessDeniedError(
          `[Access Denied] Action '${action}' is denied for profiles '${profileStr}' on table '${tableName}'.`,
        );
      }
    }

    // --- 2. FIELD RBAC (Data Trim/Validation) ---
    const resolveDynamicFields = async (
      fields: readonly string[] | "*" | ((ctx: any) => any) | undefined
    ): Promise<Set<string> | "*" | null> => {
      if (fields === "*") return "*";
      if (typeof fields === "function") {
        const res = await fields(ctx);
        if (res === "*") return "*";
        if (Array.isArray(res)) return new Set(res);
        return null;
      }
      if (Array.isArray(fields)) return new Set(fields);
      return null;
    };

    const allowedProjections = await resolveDynamicFields(resolvedConfig.allowedProjections);
    const allowedFilters = await resolveDynamicFields(resolvedConfig.allowedFilters);
    const allowedSorts = await resolveDynamicFields(resolvedConfig.allowedSorts);
    const allowedSets = await resolveDynamicFields(resolvedConfig.allowedSets);

    const query = params.query as any;
    const setParams = params.set as any;
    const dataParams = params.data as any;
    const filter = params.filter as any;

    if (query?.projection) {
      if (!allowedProjections) {
        throw new AccessDeniedError(`[Access Denied] Projection is strictly denied.`);
      } else {
        const allowed = handleFields(query.projection, allowedProjections, isThrowError, "projection", ctx);
        if (!allowed) {
          throw new AccessDeniedError(`[Access Denied] No valid fields left in projection after trimming.`);
        }
        query.projection = allowed;
      }
    }

    if (query?.order) {
      const orderKeys = Object.keys(query.order);
      const allowedKeys = handleFields(orderKeys, allowedSorts, isThrowError, "sort", ctx);
      if (!allowedKeys && orderKeys.length > 0) {
        throw new AccessDeniedError(`[Access Denied] No valid fields left in order (sort) after trimming.`);
      }
      if (allowedKeys) {
        const newOrder: any = {};
        for (const k of allowedKeys) newOrder[k] = query.order[k];
        query.order = newOrder;
      } else {
        delete query.order;
      }
    }

    if (setParams && action === "update") {
      const setKeys = Object.keys(setParams);
      const allowedKeys = handleFields(setKeys, allowedSets, isThrowError, "set", ctx);
      if (!allowedKeys && setKeys.length > 0) {
        throw new AccessDeniedError(`[Access Denied] No valid fields left in set after trimming.`);
      }
      if (allowedKeys) {
        const newSet: any = {};
        for (const k of allowedKeys) newSet[k] = setParams[k];
        params.set = newSet;
      }
    }

    if (dataParams && action === "create") {
      const items = Array.isArray(dataParams) ? dataParams : [dataParams];
      const newItems = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dataKeys = Object.keys(item);
        const allowedKeys = handleFields(dataKeys, allowedSets, isThrowError, "create data", ctx);
        if (!allowedKeys && dataKeys.length > 0) {
          throw new AccessDeniedError(`[Access Denied] No valid fields left in data after trimming.`);
        }
        if (allowedKeys) {
          const newItem: any = {};
          for (const k of allowedKeys) newItem[k] = item[k];
          newItems.push(newItem);
        }
      }
      params.data = Array.isArray(dataParams) ? newItems : newItems[0];
    }

    const processFilter = (targetFilter: any) => {
      if (allowedFilters === "*") return targetFilter;
      
      if (!allowedFilters) {
        throw new AccessDeniedError(`[Access Denied] Filtering is strictly denied.`);
      }

      const trimmed = trimFilterObj(targetFilter, allowedFilters, ctx);
      if (!trimmed) {
        throw new AccessDeniedError(`[Access Denied] No valid fields left in filter after trimming.`);
      }
      return trimmed;
    };

    if (query?.filter) {
      query.filter = processFilter(query.filter);
    }
    if (filter) {
      params.filter = processFilter(filter);
    }

    return next();
  };
}