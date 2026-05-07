import { resolveRelationPath } from "./metadata-explorer";

export type QueryPaths = {
  ctePaths: Set<string>;
  outerPaths: Set<string>;
  needsGroupBy: boolean;
};

/**
 * Extracts the relation path from a full column path.
 * e.g., "posts.comments.date" -> "posts.comments"
 * "name" -> null (base table column)
 */
export function getRelationPath(fullPath: string): string | null {
  const lastDotIndex = fullPath.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return null; // It's a base table column
  }
  return fullPath.substring(0, lastDotIndex);
}

/**
 * Analyzes the query to separate CTE joins, Outer joins, and determine if GROUP BY is needed.
 * Applies Rule A (Inner/CTE Joins) and Rule B (Outer Joins).
 */
export function analyzeQuery<T>(
  query: SearchQuery<T>,
  metadata: any,
  baseTableName: string,
): QueryPaths {
  const ctePaths = new Set<string>();
  const outerPaths = new Set<string>();
  let needsGroupBy = false;

  // 1. Analyze Filter (Rule A: must be inside CTE)
  if (query.filter) {
    extractFilterPaths(query.filter, ctePaths);
  }

  // 2. Analyze Order (Rule A: must be inside CTE)
  if (query.order) {
    extractOrderPaths(query.order, ctePaths, (fullPath, config) => {
      if (config && typeof config === "object" && "aggregate" in config) {
        needsGroupBy = true;
      } else {
        const relPath = getRelationPath(fullPath);
        if (relPath) {
          const nodes = resolveRelationPath(metadata, baseTableName, relPath);
          const hasArrayRelation = nodes.some((n) => n.isArray);
          if (hasArrayRelation) {
            needsGroupBy = true;
          }
        }
      }
    });
  }

  // 3. Analyze Projection (Rule B: outer joins for hydration)
  if (query.projection && Array.isArray(query.projection)) {
    for (const path of query.projection) {
      const relPath = getRelationPath(path as string);
      // We must add it to outer paths to hydrate the data, even if it was used in CTE
      // because CTE only returns the base table ID.
      if (relPath) {
        outerPaths.add(relPath);
      }
    }
  }

  return { ctePaths, outerPaths, needsGroupBy };
}

function extractFilterPaths(filter: any, paths: Set<string>) {
  if (!filter || typeof filter !== "object") return;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or") {
      if (Array.isArray(value)) {
        for (const item of value) {
          extractFilterPaths(item, paths);
        }
      }
    } else if (key === "$not") {
      extractFilterPaths(value, paths);
    } else if (!key.startsWith("$")) {
      const relationPath = getRelationPath(key);
      if (relationPath) {
        paths.add(relationPath);
      }
    }
  }
}

function extractOrderPaths(
  order: any,
  paths: Set<string>,
  onField: (fullPath: string, config: any) => void,
) {
  if (!order || typeof order !== "object") return;

  for (const [key, value] of Object.entries(order)) {
    const relationPath = getRelationPath(key);
    if (relationPath) {
      paths.add(relationPath);
    }
    onField(key, value);
  }
}
