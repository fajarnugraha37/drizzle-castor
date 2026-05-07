import { SQL, eq, asc, desc, sql, getTableColumns, aliasedTable, getTableName } from "drizzle-orm";
import { getColumn } from "./alias-manager";
import type { AliasMap } from "./alias-manager";
import { resolveRelationPath } from "./metadata-explorer";
import { buildFieldOperator, buildConjunction } from "./operator-builder";
import { min, max } from "drizzle-orm"; // Note: min/max imports may vary by dialect, sql`` is safer

/**
 * Builds a specific selection object for Drizzle to only select requested columns.
 * Returns undefined if projection is empty (defaulting to select all).
 */
export function buildSelection(
  projection: string[] | undefined,
  baseTableName: string,
  baseTable: AnyTable,
  aliasMap: AliasMap,
): any {
  if (!projection || projection.length === 0) return undefined;

  const selection: any = {};

  // Always select the base table ID for hydration logic
  selection[baseTableName] = {
    id: (baseTable as any).id,
  };

  for (const path of projection) {
    const lastDotIndex = path.lastIndexOf(".");
    if (lastDotIndex === -1) {
      selection[baseTableName][path] = (baseTable as any)[path];
    } else {
      const relPath = path.substring(0, lastDotIndex);
      const colName = path.substring(lastDotIndex + 1);
      const aliasName = `rel_${relPath.replace(/\./g, "_")}`;

      if (!selection[aliasName]) {
        selection[aliasName] = {};
        const aliasedTable = aliasMap.get(relPath);
        if (aliasedTable && (aliasedTable as any).id) {
          selection[aliasName]["id"] = (aliasedTable as any).id; // Always include relation ID for hydration
        }
      }

      const aliasedTable = aliasMap.get(relPath);
      if (aliasedTable) {
        selection[aliasName][colName] = (aliasedTable as any)[colName];
      }
    }
  }

  return selection;
}
export function applyJoins(
  qb: any, // The Drizzle query builder instance
  paths: Set<string>,
  tables: readonly AnyTable[],
  metadata: any,
  baseTableName: string,
  baseTable: AnyTable,
  aliasMap: AliasMap,
) {
  // Sort paths by depth so parents are joined before children
  const sortedPaths = Array.from(paths).sort(
    (a, b) => a.split(".").length - b.split(".").length,
  );

  let currentQb = qb;

  for (const path of sortedPaths) {
    const nodes = resolveRelationPath(metadata, baseTableName, path);
    const lastNode = nodes[nodes.length - 1];
    const aliased = aliasMap.get(path);

    if (lastNode && aliased) {
      const lastDotIndex = path.lastIndexOf(".");
      const parentTable =
        lastDotIndex === -1
          ? baseTable
          : aliasMap.get(path.substring(0, lastDotIndex));

      if (!parentTable) {
        throw new Error(`Parent table alias not found for path '${path}'`);
      }

      if (lastNode.type === "manyToMany") {
        const joinTableName = lastNode.joinTable;
        const localColumnName = lastNode.localKey?.split(".")[1];
        const joinLocalColumnName = lastNode.joinLocalKey?.split(".")[1];
        const relatedColumnName = lastNode.relatedKey?.split(".")[1];
        const joinRelatedColumnName = lastNode.joinRelatedKey?.split(".")[1];

        if (joinTableName && localColumnName && joinLocalColumnName && relatedColumnName && joinRelatedColumnName) {
           const joinTableObj = tables.find(t => getTableName(t) === joinTableName);
           if (!joinTableObj) throw new Error(`Join table ${joinTableName} not found`);
           
           const joinTableAlias = aliasedTable(joinTableObj, `rel_${path.replace(/\./g, "_")}_bridge`);
           
           const localCol = (parentTable as any)[localColumnName];
           const joinLocalCol = (joinTableAlias as any)[joinLocalColumnName];
           
           const relatedCol = (aliased as any)[relatedColumnName];
           const joinRelatedCol = (joinTableAlias as any)[joinRelatedColumnName];

           if (localCol && joinLocalCol && relatedCol && joinRelatedCol) {
              currentQb = currentQb.leftJoin(joinTableAlias, eq(localCol, joinLocalCol));
              currentQb = currentQb.leftJoin(aliased, eq(joinRelatedCol, relatedCol));
           }
        }
      } else {
        // Safely extract column names from "tableName.columnName" strings
        const localColumnName = lastNode.localKey?.split(".")[1];
        const foreignColumnName = lastNode.foreignKey?.split(".")[1];

        if (localColumnName && foreignColumnName) {
          const localCol = (parentTable as any)[localColumnName];
          const foreignCol = (aliased as any)[foreignColumnName];

          if (localCol && foreignCol) {
            currentQb = currentQb.leftJoin(aliased, eq(localCol, foreignCol));
          }
        }
      }
    }
  }

  return currentQb;
}

/**
 * Parses the FilterQuery object and converts it into a Drizzle SQL condition.
 */
export function parseFilter(
  filter: any,
  baseTable: AnyTable,
  aliasMap: AliasMap,
): SQL | undefined {
  if (!filter || typeof filter !== "object") return undefined;

  const conditions: (SQL | undefined)[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$not") {
      if (Array.isArray(value)) {
        const subConditions = value.map((v) =>
          parseFilter(v, baseTable, aliasMap),
        );
        conditions.push(buildConjunction(key as any, subConditions));
      } else if (key === "$not") {
        const subCond = parseFilter(value, baseTable, aliasMap);
        if (subCond) conditions.push(buildConjunction("$not", [subCond]));
      }
    } else if (!key.startsWith("$")) {
      // It's a field path
      const col = getColumn(key, baseTable, aliasMap);
      if (col && typeof value === "object" && value !== null) {
        for (const [op, opValue] of Object.entries(value as object)) {
          conditions.push(buildFieldOperator(col, op, opValue));
        }
      }
    }
  }

  return buildConjunction("$and", conditions);
}

/**
 * Parses the OrderQuery object and returns an array of Drizzle Order clauses.
 * Supports Smart Aggregation using sql`` for MAX/MIN.
 */
export function parseOrder(
  order: any,
  baseTable: AnyTable,
  aliasMap: AliasMap,
): SQL[] {
  if (!order || typeof order !== "object") return [];

  const clauses: SQL[] = [];

  for (const [key, config] of Object.entries(order)) {
    const col = getColumn(key, baseTable, aliasMap);
    if (!col) continue;

    let dir = "asc";
    let agg: string | undefined = undefined;

    if (typeof config === "string") {
      dir = config;
    } else if (typeof config === "object" && config !== null) {
      dir = (config as any).direction || "asc";
      agg = (config as any).aggregate;
    }

    if (agg) {
      // Smart Aggregation fallback: MIN for asc, MAX for desc if agg is specifically requested
      const aggFunc = agg.toUpperCase();
      const sortDir = dir === "desc" ? sql`DESC` : sql`ASC`;
      // Use SQL template literal to force the aggregation function
      clauses.push(sql`${sql.raw(aggFunc)}(${col}) ${sortDir}`);
    } else {
      clauses.push(dir === "desc" ? desc(col) : asc(col));
    }
  }

  return clauses;
}
