import type { SoftDeleteConfig } from "../types";

/**
 * Resolves static values, synchronous functions, or asynchronous promises
 */
export async function resolveProviderValues(configObj: any): Promise<Record<string, any>> {
  if (!configObj) return {};
  const resolved: Record<string, any> = {};
  for (const [key, provider] of Object.entries(configObj)) {
    if (typeof provider === "function") {
      resolved[key] = await provider();
    } else {
      resolved[key] = provider;
    }
  }
  return resolved;
}

/**
 * Injects soft delete filters into the user query.
 * mode="active": Only show records where deleteValue is NULL or != deleteValue.
 * mode="deleted": Only show records where deleteValue matches (or IS NOT NULL for dynamic values).
 */
export async function injectSoftDeleteFilter(query: any, metadata: any, tableName: string, mode: "active" | "deleted") {
  const config = metadata[tableName]?.softDelete as SoftDeleteConfig<any>;
  if (!config || !config.deleteValue) return query; // If no soft delete config, do nothing

  const softFilterConditions: any[] = [];
  const resolvedDelete = await resolveProviderValues(config.deleteValue);
  
  if (mode === "active") {
    for (const [key, val] of Object.entries(resolvedDelete)) {
      if (typeof config.deleteValue[key] === "function") {
        // If dynamic (like Date.now()), an active record is one where the column is NULL
        softFilterConditions.push({ [key]: { $isNull: true } });
      } else {
        // If static (like 1), an active record is != 1 OR IS NULL
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
      if (typeof config.deleteValue[key] === "function") {
        // If dynamic, a deleted record is one where the column IS NOT NULL
        softFilterConditions.push({ [key]: { $notIsNull: true } });
      } else {
        // If static, a deleted record is == val
        softFilterConditions.push({ [key]: { $eq: val } });
      }
    }
  }

  // Merge the soft filter with the user's existing filter using an $and conjunction
  if (softFilterConditions.length > 0) {
    const softFilter = { $and: softFilterConditions };
    // console.log(`[SoftDelete] Injecting into ${tableName} (${mode}):`, JSON.stringify(softFilter, null, 2));
    if (!query.filter || Object.keys(query.filter).length === 0) {
      query.filter = softFilter;
    } else {
      query.filter = {
        $and: [query.filter, softFilter]
      };
    }
  }

  return query;
}

