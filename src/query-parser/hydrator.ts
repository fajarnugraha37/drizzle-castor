import { resolveRelationPath } from "./metadata-explorer";
import { generateAliasName } from "./alias-manager";

/**
 * Utility to unflatten an object with dot-notation keys.
 * Also parses stringified JSON values (common in SQLite json_extract).
 */
function unflattenAndParseJson(obj: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    let parsedValue = value;
    if (typeof value === "string") {
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        // Not a JSON string, keep as is
      }
    }

    if (key.includes(".")) {
      const parts = key.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
      current[parts[parts.length - 1]!] = parsedValue;
    } else {
      result[key] = parsedValue;
    }
  }
  return result;
}

/**
 * Hydrates flat SQL rows from Drizzle (Core Query Builder) back into nested JSON objects.
 * Handles arrays (OneToMany) and objects (ManyToOne) by inspecting the metadata.
 *
 * Assumes the query was built without explicit select() overrides, meaning Drizzle
 * returns rows in the format: { baseTable: {...}, rel_posts: {...}, ... }
 */
export function hydrateResults(
  rows: any[],
  baseTableName: string,
  metadata: any,
  primaryKeyField: string = "id",
  paths: string[] = []
): any[] {
  const rootMap = new Map<any, any>();

  // Build inverse map from exact alias name to original path
  const aliasToPath = new Map<string, string>();
  for (const path of paths) {
    aliasToPath.set(generateAliasName(path), path);
  }

  for (const row of rows) {
    const rawBaseObj = row[baseTableName];
    if (!rawBaseObj) continue;

    const baseObj = unflattenAndParseJson(rawBaseObj);
    const rootId = baseObj[primaryKeyField];
    
    if (!rootMap.has(rootId)) {
      rootMap.set(rootId, { ...baseObj });
    } else {
      // Merge in case JSON properties are split across rows, though unlikely for base table
      Object.assign(rootMap.get(rootId), baseObj);
    }

    const rootEntity = rootMap.get(rootId);

    // Process relations in the current row
    for (const [alias, rawData] of Object.entries(row)) {
      // Ignore base table, internal CTE alias (sq), or null/empty joined rows
      if (alias === baseTableName || alias === "sq" || !rawData) continue;

      const data = unflattenAndParseJson(rawData);

      // Safely resolve the exact path using the alias map
      let path = aliasToPath.get(alias);
      if (!path) {
        // Fallback for custom projections/aliases not strictly tracked in outerPaths
        path = alias.startsWith("rel_")
          ? alias.substring(4).replace(/_/g, ".")
          : alias;
      }

      try {
        const nodes = resolveRelationPath(metadata, baseTableName, path);
        let currentLevel = rootEntity;

        // Traverse the path to place the data
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]!;
          const isLast = i === nodes.length - 1;
          const relName = node.relationName;

          if (node.isArray) {
            if (!currentLevel[relName]) {
              currentLevel[relName] = [];
            }

            const relArray = currentLevel[relName] as any[];

            if (isLast) {
              // Ensure we don't add duplicate relation objects (based on their ID)
              const dataId = (data as any)[primaryKeyField];
              const exists = relArray.find(
                (item) => item[primaryKeyField] === dataId,
              );

              if (!exists) {
                // If there's an empty placeholder object (created by deep traversal), merge into it
                if (relArray.length > 0 && !relArray[relArray.length - 1][primaryKeyField]) {
                   Object.assign(relArray[relArray.length - 1], data);
                } else {
                   relArray.push({ ...data });
                }
              } else {
                Object.assign(exists, data);
              }
            } else {
              // We are traversing through an array to get to the nested relation
              // We attach to the LAST item in the array since the flat row represents the current combination
              if (relArray.length === 0) {
                relArray.push({});
              }
              currentLevel = relArray[relArray.length - 1];
            }
          } else {
            // Object relation (ManyToOne / OneToOne)
            if (isLast) {
              if (currentLevel[relName]) {
                Object.assign(currentLevel[relName], data);
              } else {
                currentLevel[relName] = { ...data };
              }
            } else {
              if (!currentLevel[relName]) {
                currentLevel[relName] = {};
              }
              currentLevel = currentLevel[relName];
            }
          }
        }
      } catch (e) {
        // If resolving relation path fails, it might be an unexpected alias. Ignore.
        console.warn(`Hydration warning: ${e}`);
      }
    }
  }

  return Array.from(rootMap.values());
}
