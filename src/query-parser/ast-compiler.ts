import { SQL, eq, asc, desc, sql, aliasedTable, getTableName, and, isNull, ne, or } from "drizzle-orm";
import { getColumn } from "./alias-manager";
import type { AliasMap } from "./alias-manager";
import { resolvePathSegments, resolveRelationPath } from "./metadata-explorer";
import { buildFieldOperator, buildConjunction } from "./operator-builder";
import { buildJsonExtractionSql } from "./json-resolver";
import type { AnyDatabase } from "../types";
import { AliasNotFoundError, SecurityError, TableNotFoundError } from "../errors";

/**
 * Builds a specific selection object for Drizzle to only select requested columns.
 * Returns undefined if projection is empty (defaulting to select all).
 */
export function buildSelection(
  projection: string[] | undefined,
  baseTableName: string,
  baseTable: any,
  aliasMap: AliasMap,
  metadata: any,
  db: any,
): any {
  if (!projection || projection.length === 0) return undefined;

  const selection: any = {};

  // Always select the base table ID for hydration logic
  selection[baseTableName] = {
    id: (baseTable as any).id,
  };

  for (const path of projection) {
    const resolution = resolvePathSegments(metadata, baseTableName, path);
    const relPath = resolution.relationPath;

    let targetTable: any = baseTable;
    let aliasName = baseTableName;

    if (relPath) {
      aliasName = `rel_${relPath.replace(/\./g, "_")}`;
      targetTable = aliasMap.get(relPath);

      if (!selection[aliasName]) {
        selection[aliasName] = {};
        if (targetTable && targetTable.id) {
          selection[aliasName]["id"] = targetTable.id; // Always include relation ID for hydration
        }
      }
    } else {
      if (!selection[baseTableName]) {
        selection[baseTableName] = {};
      }
    }

    if (targetTable && resolution.jsonPath) {
      const jsonParts = resolution.jsonPath.split(".");
      const columnName = jsonParts[0]!;
      const rawColumn = targetTable[columnName];

      if (rawColumn) {
        if (jsonParts.length > 1) {
          // JSON nested property extraction via SQL
          const jsonRoute = jsonParts.slice(1).join(".");
          // Crucial: assign to the exact string path requested so hydrator can pick it up
          selection[aliasName][resolution.jsonPath] = buildJsonExtractionSql(db, rawColumn, jsonRoute);
        } else {
          // Normal physical column
          selection[aliasName][columnName] = rawColumn;
        }
      }
    }
  }

  return selection;
}

export function applyJoins(
  qb: any, // The Drizzle query builder instance
  paths: Set<string>,
  tables: readonly any[],
  metadata: any,
  baseTableName: string,
  baseTable: any,
  aliasMap: AliasMap,
  resolvedSoftDelete: Record<string, { restore?: any, delete?: any }>,
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
        throw new AliasNotFoundError(`Parent table alias not found for path '${path}'`);
      }

      let softDeleteConditions: SQL | undefined = undefined;
      const sdConfig = resolvedSoftDelete[lastNode.relatedTable];
      if (sdConfig && sdConfig.delete) {
        const conditions: SQL[] = [];
        
        // Apply active soft delete filter to related tables using deleteValue
        const origDelete = metadata[lastNode.relatedTable]?.softDelete?.deleteValue;
        for (const [k, v] of Object.entries(sdConfig.delete)) {
          const col = (aliased as any)[k];
          if (origDelete && typeof origDelete[k] === "function") {
            conditions.push(isNull(col));
          } else {
            conditions.push(or(ne(col, v), isNull(col)) as SQL);
          }
        }

        if (conditions.length > 0) {
          softDeleteConditions = and(...conditions);
        }
      }

      if (lastNode.type === "manyToMany") {
        const joinTableName = lastNode.joinTable;
        const localColumnName = lastNode.localKey?.split(".")[1];
        const joinLocalColumnName = lastNode.joinLocalKey?.split(".")[1];
        const relatedColumnName = lastNode.relatedKey?.split(".")[1];
        const joinRelatedColumnName = lastNode.joinRelatedKey?.split(".")[1];

        if (joinTableName && localColumnName && joinLocalColumnName && relatedColumnName && joinRelatedColumnName) {
           const joinTableObj = tables.find(t => getTableName(t) === joinTableName);
           if (!joinTableObj) throw new TableNotFoundError(`Join table ${joinTableName} not found`);
           
           const joinTableAlias = aliasedTable(joinTableObj, `rel_${path.replace(/\./g, "_")}_bridge`);
           
           const localCol = (parentTable as any)[localColumnName];
           const joinLocalCol = (joinTableAlias as any)[joinLocalColumnName];
           
           const relatedCol = (aliased as any)[relatedColumnName];
           const joinRelatedCol = (joinTableAlias as any)[joinRelatedColumnName];

           if (localCol && joinLocalCol && relatedCol && joinRelatedCol) {
              currentQb = currentQb.leftJoin(joinTableAlias, eq(localCol, joinLocalCol));
              const joinCond = softDeleteConditions ? and(eq(joinRelatedCol, relatedCol), softDeleteConditions) : eq(joinRelatedCol, relatedCol);
              currentQb = currentQb.leftJoin(aliased, joinCond);
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
            const joinCond = softDeleteConditions ? and(eq(localCol, foreignCol), softDeleteConditions) : eq(localCol, foreignCol);
            currentQb = currentQb.leftJoin(aliased, joinCond);
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
  baseTable: any,
  aliasMap: AliasMap,
  metadata: any,
  baseTableName: string,
  db: AnyDatabase,
): SQL | undefined {
  if (!filter || typeof filter !== "object") return undefined;

  const conditions: (SQL | undefined)[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$not") {
      if (Array.isArray(value)) {
        const subConditions = value.map((v) =>
          parseFilter(v, baseTable, aliasMap, metadata, baseTableName, db),
        );
        conditions.push(buildConjunction(key as any, subConditions));
      } else if (key === "$not") {
        const subCond = parseFilter(value, baseTable, aliasMap, metadata, baseTableName, db);
        if (subCond) conditions.push(buildConjunction("$not", [subCond]));
      }
    } else if (!key.startsWith("$")) {
      // It's a field path
      const col = getColumn(key, baseTable, aliasMap, metadata, baseTableName, db);
      if (col && typeof value === "object" && value !== null) {
        for (const [op, opValue] of Object.entries(value as object)) {
          conditions.push(buildFieldOperator(col, op, opValue, db));
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
  baseTable: any,
  aliasMap: AliasMap,
  metadata: any,
  baseTableName: string,
  db: AnyDatabase,
): SQL[] {
  if (!order || typeof order !== "object") return [];

  const clauses: SQL[] = [];

  for (const [key, config] of Object.entries(order)) {
    const col = getColumn(key, baseTable, aliasMap, metadata, baseTableName, db);
    if (!col) continue;

    let dir = "asc";
    let agg: string | undefined = undefined;
    let nullsPosition: string | undefined = undefined;

    if (typeof config === "string") {
      dir = config;
    } else if (typeof config === "object" && config !== null) {
      dir = (config as any).direction || "asc";
      agg = (config as any).aggregate;
      nullsPosition = (config as any).nulls;
    }

    const sortDir = dir === "desc" ? sql`DESC` : sql`ASC`;
    let nullsSql = sql``;
    if (nullsPosition === "first") {
      nullsSql = sql` NULLS FIRST`;
    } else if (nullsPosition === "last") {
      nullsSql = sql` NULLS LAST`;
    }

    if (agg) {
      // Smart Aggregation fallback: MIN for asc, MAX for desc if agg is specifically requested
      const aggFunc = agg.toUpperCase();
      
      // SECURITY FIX: Whitelist aggregation functions to prevent SQL injection via sql.raw()
      const allowedAggs = ["MAX", "MIN", "AVG", "SUM", "COUNT"];
      if (!allowedAggs.includes(aggFunc)) {
        throw new SecurityError(`Invalid aggregation function: ${aggFunc}`);
      }

      // Use SQL template literal to force the aggregation function. 
      // sql.raw is safe here because aggFunc is strictly whitelisted above.
      clauses.push(sql`${sql.raw(aggFunc)}(${col}) ${sortDir}${nullsSql}`);
    } else if (nullsPosition) {
      clauses.push(sql`${col} ${sortDir}${nullsSql}`);
    } else {
      clauses.push(dir === "desc" ? desc(col) : asc(col));
    }
  }

  return clauses;
}
