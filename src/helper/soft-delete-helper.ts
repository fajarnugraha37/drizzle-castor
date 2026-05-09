import type { SoftDeleteConfig } from "../types";

/**
 * Checks if an object is a Promise/thenable.
 */
function isThenable(obj: any): obj is Promise<any> {
  return obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function";
}

/**
 * Resolves static values, synchronous functions, or asynchronous promises/thenables.
 */
export async function resolveProviderValues(configObj: any): Promise<Record<string, any>> {
  if (!configObj) return {};
  const resolved: Record<string, any> = {};
  for (const [key, val] of Object.entries(configObj)) {
    if (typeof val === "function") {
      resolved[key] = await val();
    } else if (isThenable(val)) {
      resolved[key] = await val;
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

/**
 * Injects soft delete filters into the user query.
 * 
 * Logic:
 * 1. Returns a NEW query object (Immutable).
 * 2. Prevents double-injection by checking if identical filters already exist (Idempotent).
 * 3. Consistently wraps in $and to maintain predictable structure.
 */
export async function injectSoftDeleteFilter(query: any, metadata: any, tableName: string, mode: "active" | "deleted") {
  const config = metadata[tableName]?.softDelete as SoftDeleteConfig<any>;
  if (!config || !config.deleteValue) return query; // If no soft delete config, do nothing

  const softFilterConditions: any[] = [];
  const resolvedDelete = await resolveProviderValues(config.deleteValue);
  
  // Build conditions based on mode
  if (mode === "active") {
    for (const [key, val] of Object.entries(resolvedDelete)) {
      const originalDef = config.deleteValue[key];
      const isDynamic = typeof originalDef === "function" || isThenable(originalDef);

      if (isDynamic) {
        softFilterConditions.push({ [key]: { $isNull: true } });
      } else {
        softFilterConditions.push({
          $or: [
            { [key]: { $ne: val } },
            { [key]: { $isNull: true } }
          ]
        });
      }
    }
  } else if (mode === "deleted") {
    for (const [key, val] of Object.entries(resolvedDelete)) {
      const originalDef = config.deleteValue[key];
      const isDynamic = typeof originalDef === "function" || isThenable(originalDef);

      if (isDynamic) {
        softFilterConditions.push({ [key]: { $notIsNull: true } });
      } else {
        softFilterConditions.push({ [key]: { $eq: val } });
      }
    }
  }

  if (softFilterConditions.length === 0) return query;

  // Create a shallow clone to avoid in-place mutation of the query object
  const newQuery = { ...query };
  const existingFilter = newQuery.filter;

  if (!existingFilter || Object.keys(existingFilter).length === 0) {
    // Case 1: No existing filter. Always wrap in $and for consistency.
    newQuery.filter = { $and: softFilterConditions };
  } else if (existingFilter.$and && Array.isArray(existingFilter.$and)) {
    // Case 2: Existing top-level $and. Merge and de-duplicate.
    const mergedAnd = [...existingFilter.$and];
    const stringifiedExisting = mergedAnd.map(f => JSON.stringify(f));

    for (const cond of softFilterConditions) {
      if (!stringifiedExisting.includes(JSON.stringify(cond))) {
        mergedAnd.push(cond);
      }
    }
    newQuery.filter = { ...existingFilter, $and: mergedAnd };
  } else {
    // Case 3: Existing filter is not an $and (could be flat or $or). 
    // Wrap it in a new top-level $and.
    const currentFilterString = JSON.stringify(existingFilter);
    const uniqueNewConditions = softFilterConditions.filter(
      cond => JSON.stringify(cond) !== currentFilterString
    );

    if (uniqueNewConditions.length > 0) {
      newQuery.filter = {
        $and: [existingFilter, ...uniqueNewConditions]
      };
    }
  }

  return newQuery;
}
