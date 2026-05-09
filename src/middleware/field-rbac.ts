import type { Middleware } from "./index";
import { AccessDeniedError } from "../errors";
import type { RepoProfileConfig } from "../types";
import { CONJUNCTION_OPERATORS } from "../types";

function mergePermissions(profiles: string[], options: Record<string, RepoProfileConfig<any, any>>) {
  let allowedProjections: Set<string> | "*" | null = null;
  let allowedFilters: Set<string> | "*" | null = null;
  let allowedSets: Set<string> | "*" | null = null;
  let allowedSorts: Set<string> | "*" | null = null;
  
  let matched = false;

  for (const p of profiles) {
    if (options[p]) {
      matched = true;
      const config = options[p];
      
      const merge = (current: Set<string> | "*" | null, incoming: readonly string[] | "*" | null | undefined) => {
        if (current === "*") return "*";
        if (incoming === "*") return "*";
        if (Array.isArray(incoming) && incoming.includes("*")) return "*";
        if (!incoming || incoming.length === 0) return current; // if incoming is empty/null, it adds 0 permissions.
        
        let newSet = current === null ? new Set<string>() : current;
        for (const item of incoming) newSet.add(item);
        return newSet;
      };

      allowedProjections = merge(allowedProjections, config.allowedProjections);
      allowedFilters = merge(allowedFilters, config.allowedFilters);
      allowedSets = merge(allowedSets, config.allowedSets);
      allowedSorts = merge(allowedSorts, config.allowedSorts);
    }
  }

  return { matched, allowedProjections, allowedFilters, allowedSets, allowedSorts };
}

function isFieldAllowed(field: string, allowedSet: Set<string> | "*"): boolean {
  if (allowedSet === "*") return true;
  if (allowedSet.has(field)) return true;
  for (const allowed of allowedSet) {
    if (field.startsWith(allowed + ".")) return true;
  }
  return false;
}

function handleFields(
  requestedFields: string[],
  allowedSet: Set<string> | "*" | null,
  isThrowError: boolean,
  actionName: string
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
    if (isThrowError) {
      throw new AccessDeniedError(`[Access Denied] Fields not allowed for ${actionName}: ${rejected.join(", ")}`);
    } else {
      console.warn(`[Field-RBAC] Trimming unallowed fields for ${actionName}: ${rejected.join(", ")}`);
    }
  }
  
  return allowed.length > 0 ? allowed : undefined;
}

function extractFilterKeys(filter: any): string[] {
  const keys = new Set<string>();
  function traverse(obj: any) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if ((CONJUNCTION_OPERATORS as readonly string[]).includes(k)) {
        traverse(v);
      } else if (!k.startsWith("$")) {
        keys.add(k);
      }
    }
  }
  traverse(filter);
  return Array.from(keys);
}

function trimFilterObj(filter: any, allowedSet: Set<string> | "*"): any {
  if (allowedSet === "*") return filter;
  if (!filter || typeof filter !== "object") return filter;
  if (Array.isArray(filter)) {
    const arr = filter.map(f => trimFilterObj(f, allowedSet)).filter(f => f !== undefined && Object.keys(f).length > 0);
    return arr.length > 0 ? arr : undefined;
  }
  
  const trimmed: any = {};
  let hasKeys = false;
  
  for (const [k, v] of Object.entries(filter)) {
    if ((CONJUNCTION_OPERATORS as readonly string[]).includes(k)) {
      const sub = trimFilterObj(v, allowedSet);
      if (sub !== undefined && Object.keys(sub).length > 0) {
        trimmed[k] = sub;
        hasKeys = true;
      }
    } else if (!k.startsWith("$")) {
      if (isFieldAllowed(k, allowedSet)) {
        trimmed[k] = v;
        hasKeys = true;
      }
    } else {
      // BUG-6 FIX: Unknown $ operators are discarded (Fail-Closed)
      console.warn(`[Field-RBAC] Discarding unknown reserved keyword in filter: ${k}`);
    }
  }
  return hasKeys ? trimmed : undefined;
}

export function createFieldRbacMiddleware(
  options: Record<string, RepoProfileConfig<any, any>>,
  mode: "strict" | "lenient",
  isThrowError: boolean
): Middleware {
  return async (ctx, next) => {
    const { action, tableName, profile, params } = ctx;

    const profilesToCheck = profile
      ? Array.isArray(profile)
        ? profile
        : [profile]
      : ["default"];

    if (profilesToCheck.length === 0) profilesToCheck.push("default");

    const merged = mergePermissions(profilesToCheck, options);

    if (!merged.matched) {
      if (mode === "lenient") {
        console.warn(`[Drizzle-Castor] Warning: No profile matched for table '${tableName}', allowing full access due to lenient mode.`);
        return next();
      } else {
        throw new AccessDeniedError(`[Access Denied] No matching profiles found for table '${tableName}' in strict mode.`);
      }
    }

    const query = params.query;
    const data = params.data;
    const setParams = params.set;
    const filter = params.filter;

    // 1. PROJECTIONS
    if (action === "read") {
      if (!params.query) params.query = {};
      const q = params.query;

      if (!q.projection) {
        if (merged.allowedProjections !== "*") {
          if (!merged.allowedProjections || merged.allowedProjections.size === 0) {
             throw new AccessDeniedError(`[Access Denied] No projections allowed.`);
          }
          q.projection = Array.from(merged.allowedProjections || []);
        }
      } else {
        const allowed = handleFields(q.projection, merged.allowedProjections, isThrowError, "projection");
        // BUG FIX: If projection is empty after trimming, it means the user has NO PERMISSION to see any data.
        // We MUST throw an error here, regardless of mode, because otherwise ast-compiler would select *
        if (!allowed && q.projection.length > 0) {
          throw new AccessDeniedError(`[Access Denied] All requested projection fields were denied.`);
        }
        q.projection = allowed;
      }
    }

    // 2. ORDER (SORTS)
    if (query?.order) {
      const orderKeys = Object.keys(query.order);
      const allowedKeys = handleFields(orderKeys, merged.allowedSorts, isThrowError, "sort");
      if (!allowedKeys && orderKeys.length > 0) {
        throw new AccessDeniedError(`[Access Denied] All requested sort fields were denied.`);
      }
      if (allowedKeys && allowedKeys.length !== orderKeys.length) {
        const newOrder: any = {};
        for (const k of allowedKeys) newOrder[k] = query.order[k];
        query.order = newOrder;
      } else if (!allowedKeys) {
        query.order = undefined;
      }
    }

    // 3. SET (UPDATE)
    if (setParams && action === "update") {
      const setKeys = Object.keys(setParams);
      const allowedKeys = handleFields(setKeys, merged.allowedSets, isThrowError, "set");
      if (!allowedKeys && setKeys.length > 0) {
        throw new AccessDeniedError(`[Access Denied] All requested set fields were denied.`);
      }
      if (allowedKeys && allowedKeys.length !== setKeys.length) {
        const newSet: any = {};
        for (const k of allowedKeys) newSet[k] = setParams[k];
        params.set = newSet;
      } else if (!allowedKeys) {
        params.set = undefined;
      }
    }

    // 4. DATA (CREATE)
    if (data && action === "create") {
      const items = Array.isArray(data) ? data : [data];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dataKeys = Object.keys(item);
        const allowedKeys = handleFields(dataKeys, merged.allowedSets, isThrowError, "create data");
        if (!allowedKeys && dataKeys.length > 0) {
          throw new AccessDeniedError(`[Access Denied] All requested creation fields were denied.`);
        }
        if (allowedKeys && allowedKeys.length !== dataKeys.length) {
          const newData: any = {};
          for (const k of allowedKeys) newData[k] = item[k];
          items[i] = newData;
        } else if (!allowedKeys) {
          items[i] = {}; 
        }
      }
      params.data = Array.isArray(data) ? items : items[0];
    }

    // 5. FILTERS
    const processFilter = (targetFilter: any) => {
      if (!targetFilter) return targetFilter;
      const keys = extractFilterKeys(targetFilter);
      if (keys.length === 0) return targetFilter;
      
      const rejected = keys.filter(k => !isFieldAllowed(k, merged.allowedFilters || new Set()));
      if (rejected.length > 0) {
        if (isThrowError) {
          throw new AccessDeniedError(`[Access Denied] Fields not allowed for filter: ${rejected.join(", ")}`);
        } else {
          console.warn(`[Field-RBAC] Trimming unallowed fields for filter: ${rejected.join(", ")}`);
          const trimmed = trimFilterObj(targetFilter, merged.allowedFilters || new Set());
          if (!trimmed) {
            throw new AccessDeniedError(`[Access Denied] All requested filter fields were denied.`);
          }
          return trimmed;
        }
      }
      return targetFilter;
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
