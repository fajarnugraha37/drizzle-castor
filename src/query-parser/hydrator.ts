import { getTableColumns } from "drizzle-orm";
import { resolveRelationPath } from "./metadata-explorer";
import { generateAliasName } from "./alias-manager";
import { assertSafeKey } from "../helper";

/**
 * Utility to unflatten an object with dot-notation keys.
 * Also parses stringified JSON values ONLY if they are marked as JSON in metadata
 * or if they are results of a JSON extraction path.
 */
function unflattenAndParseJson(obj: any, tableColumns?: Record<string, any>): any {
  const result: any = Object.create(null);
  
  for (const [key, value] of Object.entries(obj)) {
    let parsedValue = value;
    
    // BUG-4 FIX: Only parse JSON if we are sure it's intended to be JSON
    if (typeof value === "string") {
      const col = tableColumns ? tableColumns[key] : undefined;
      const isJsonColumn = col && (col as any).dataType === "json";
      const isJsonExtraction = key.includes("."); // Results of json_extract often have dots
      
      if (isJsonColumn || isJsonExtraction) {
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const potential = JSON.parse(value);
            if (potential !== null && typeof potential === "object") {
              parsedValue = potential;
            }
          } catch (e) {
            // Not valid JSON, keep as string
          }
        }
      }
    }

    if (key.includes(".")) {
      const parts = key.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        assertSafeKey(part, "hydration");
        if (!current[part]) {
          const nextPart = parts[i + 1]!;
          if (!isNaN(Number(nextPart))) {
            current[part] = [];
          } else {
            current[part] = Object.create(null);
          }
        }
        current = current[part];
      }
      const lastPart = parts[parts.length - 1]!;
      assertSafeKey(lastPart, "hydration");
      current[lastPart] = parsedValue;
    } else {
      assertSafeKey(key, "hydration");
      result[key] = parsedValue;
    }
  }
  return result;
}

/**
 * Hydrates flat SQL rows from Drizzle (Core Query Builder) back into nested JSON objects.
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

  // Pre-resolve base table columns for faster lookup
  const baseTableObj = metadata[baseTableName]?.table;
  const baseTableColumns = baseTableObj ? getTableColumns(baseTableObj) : undefined;
  
  // Cache for relation table columns to avoid repeated getTableColumns calls
  const relationColumnsCache = new Map<string, Record<string, any>>();

  for (const row of rows) {
    const rawBaseObj = row[baseTableName];
    if (!rawBaseObj) continue;

    const baseObj = unflattenAndParseJson(rawBaseObj, baseTableColumns);
    const rootId = baseObj[primaryKeyField];

    if (!rootMap.has(rootId)) {
      rootMap.set(rootId, { ...baseObj });
    } else {
      Object.assign(rootMap.get(rootId), baseObj);
    }

    const rootEntity = rootMap.get(rootId);

    // Process relations in the current row
    for (const [alias, rawData] of Object.entries(row)) {
      if (alias === baseTableName || alias === "sq" || !rawData) continue;

      // FIX MEDIUM: Strict alias resolution to avoid underscore collisions
      let path = aliasToPath.get(alias);
      if (!path) {
         // If it's not in our explicit path map, it might be a custom selection.
         // We ignore it to prevent incorrect hydration logic (Case: underscores in table names).
         continue;
      }

      let relTableColumns: Record<string, any> | undefined;
      try {
        const nodes = resolveRelationPath(metadata, baseTableName, path);
        const lastNode = nodes[nodes.length - 1];
        
        if (lastNode) {
          const tableName = lastNode.relatedTable;
          if (!relationColumnsCache.has(tableName)) {
            const tableObj = metadata[tableName]?.table;
            if (tableObj) {
              relationColumnsCache.set(tableName, getTableColumns(tableObj));
            }
          }
          relTableColumns = relationColumnsCache.get(tableName);
        }

        const data = unflattenAndParseJson(rawData, relTableColumns);
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
              const dataId = (data as any)[primaryKeyField];
              const exists = relArray.find((item) => item[primaryKeyField] === dataId);

              if (!exists) {
                if (relArray.length > 0 && !relArray[relArray.length - 1][primaryKeyField]) {
                   Object.assign(relArray[relArray.length - 1], data);
                } else {
                   relArray.push({ ...data });
                }
              } else {
                Object.assign(exists, data);
              }
            } else {
              if (relArray.length === 0) relArray.push({});
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
              if (!currentLevel[relName]) currentLevel[relName] = {};
              currentLevel = currentLevel[relName];
            }
          }
        }
      } catch (e) {
        console.warn(`Hydration warning: ${e}`);
      }
    }
  }

  return Array.from(rootMap.values());
}
