import { aliasedTable, getTableName } from "drizzle-orm";
import { resolveRelationPath } from "./metadata-explorer";
import type { RelationNode } from "./metadata-explorer";

export type AliasMap = Map<string, AnyTable>;

/**
 * Creates deterministic path-based aliases for Drizzle tables.
 * Replaces dots with underscores.
 * e.g., "posts.comments" -> "rel_posts_comments"
 */
export function generateAliasName(path: string): string {
  return `rel_${path.replace(/\./g, "_")}`;
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
): AliasMap {
  const aliasMap: AliasMap = new Map();

  for (const path of paths) {
    const nodes = resolveRelationPath(metadata, baseTableName, path);
    // Determine the final table in the path
    const lastNode = nodes[nodes.length - 1];

    if (lastNode) {
      const targetTable = tables.find((t) => getTableName(t) === lastNode.relatedTable);
      if (!targetTable) {
        throw new Error(`Table '${lastNode.relatedTable}' not found in provided tables array.`);
      }

      const aliasName = generateAliasName(path);
      const aliased = aliasedTable(targetTable, aliasName);
      aliasMap.set(path, aliased);
    }
  }

  return aliasMap;
}

/**
 * Helper to safely extract a column from an aliased table (or base table).
 */
export function getColumn(
  path: string, // full path, e.g., "posts.comments.date" or "name"
  baseTable: AnyTable,
  aliasMap: AliasMap,
): any {
  const lastDotIndex = path.lastIndexOf(".");
  if (lastDotIndex === -1) {
    // It's a base table column
    return (baseTable as any)[path];
  }

  const relationPath = path.substring(0, lastDotIndex);
  const columnName = path.substring(lastDotIndex + 1);

  const aliased = aliasMap.get(relationPath);
  if (!aliased) {
    throw new Error(`Alias not found for relation path '${relationPath}'. Make sure it was added to the CTE or Outer paths.`);
  }

  return (aliased as any)[columnName];
}
