import { aliasedTable, getTableName, getTableColumns } from "drizzle-orm";
import { resolvePathSegments, resolveRelationPath } from "./metadata-explorer";
import { buildJsonExtractionSql } from "./json-resolver";
import type { AliasMap, AnyTable } from "../types";
import { TableNotFoundError, AliasNotFoundError, ColumnNotFoundError } from "../errors";


/**
 * Creates deterministic path-based aliases for Drizzle tables.
 * Replaces dots with underscores.
 * e.g., "posts.comments" -> "rel_posts_comments"
 */
export function generateAliasName(path: string, prefix: string = "rel"): string {
  return `${prefix}_${path.replace(/\./g, "_")}`;
}

/**
 * Resolves required table aliases for the given relation paths.
 * Iterates through paths and builds AliasedTable instances.
 */
export function buildAliases(
  paths: Set<string>,
  tables: readonly AnyTable[],
  metadata: any,
  baseTableName: string,
  prefix: string = "rel",
): AliasMap {
  const aliasMap: AliasMap = new Map();

  const pathsArray = Array.from(paths);
  for (const path of pathsArray) {
    const nodes = resolveRelationPath(metadata, baseTableName, path);
    // Determine the final table in the path
    const lastNode = nodes[nodes.length - 1];

    if (lastNode) {
      const targetTable = tables.find((t) => getTableName(t) === lastNode.relatedTable);
      if (!targetTable) {
        throw new TableNotFoundError(`Table '${lastNode.relatedTable}' not found in provided tables array.`);
      }

      const aliasName = generateAliasName(path, prefix);
      const aliased = aliasedTable(targetTable, aliasName);
      aliasMap.set(path, aliased);
    }
  }

  return aliasMap;
}

/**
 * Safely extracts a column from an aliased table (or base table).
 * If the path includes a JSON route, it generates a dialect-specific JSON extraction SQL snippet.
 */
export function getColumn(
  path: string, // full path, e.g., "posts.comments.date" or "persona.hobbies"
  baseTable: AnyTable,
  aliasMap: AliasMap,
  metadata: any,
  baseTableName: string,
  db: any,
): any {
  const resolution = resolvePathSegments(metadata, baseTableName, path);
  
  let targetTable: any = baseTable;
  if (resolution.relationPath) {
    targetTable = aliasMap.get(resolution.relationPath);
    if (!targetTable) {
      throw new AliasNotFoundError(`Alias not found for relation path '${resolution.relationPath}'. Make sure it was added to the CTE or Outer paths.`);
    }
  }

  if (resolution.jsonPath) {
    // The first segment of jsonPath is the actual physical column name in the table
    const jsonParts = resolution.jsonPath.split(".");
    const columnName = jsonParts[0]!;

    const columns = getTableColumns(targetTable);
    if (!Object.prototype.hasOwnProperty.call(columns, columnName)) {
      throw new ColumnNotFoundError(`Column '${columnName}' not found on table '${getTableName(targetTable)}'`);
    }

    const rawColumn = targetTable[columnName];

    if (!rawColumn) {
      throw new ColumnNotFoundError(`Column '${columnName}' not found on table '${getTableName(targetTable)}'`);
    }

    if (jsonParts.length > 1) {
      // It's a nested JSON path
      const jsonRoute = jsonParts.slice(1).join(".");
      return buildJsonExtractionSql(db, rawColumn, jsonRoute);
    } else {
      // It's just the column itself
      return rawColumn;
    }
  }

  return undefined;
}