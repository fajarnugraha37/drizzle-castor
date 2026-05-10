import type { QueryPaths } from "../types";
import { resolvePathSegments } from "./metadata-explorer";
import { logger } from "../helper/logger-helper";

/**
 * Ensures a relation path and all its intermediate parent paths are added to the Set.
 * This is crucial for building deep join chains where each level requires the previous alias.
 */
function addPathWithParents(paths: Set<string>, relPath: string): void {
  if (!relPath) return;
  const segments = relPath.split(".");
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}.${segment}` : segment;
    paths.add(current);
  }
}

/**
 * Extracts the relation path from a full column path by validating against metadata.
 * Returns null if the path does not traverse any table relations.
 */
export function getRelationPath(
  fullPath: string,
  metadata: any,
  baseTableName: string
): string | null {
  const resolution = resolvePathSegments(metadata, baseTableName, fullPath);
  return resolution.relationPath === "" ? null : resolution.relationPath;
}

/**
 * Analyzes the query to separate CTE joins, Outer joins, and determine if GROUP BY is needed.
 * Applies Rule A (Inner/CTE Joins) and Rule B (Outer Joins).
 */
export function analyzeQuery<T>(
  query: any,
  metadata: any,
  baseTableName: string,
): QueryPaths {
  const ctePaths = new Set<string>();
  const outerPaths = new Set<string>();
  let needsGroupBy = false;

  logger.debug(`Analyzing query for table '${baseTableName}'`);
  logger.trace("Query parameters:", query);

  // 1. Analyze Filter (Rule A: must be inside CTE)
  if (query.filter) {
    extractFilterPaths(query.filter, ctePaths, metadata, baseTableName);
  }

  // 2. Analyze Order (Rule A: must be inside CTE)
  if (query.order) {
    extractOrderPaths(query.order, ctePaths, metadata, baseTableName, (fullPath, config) => {
      if (config && typeof config === "object" && "aggregate" in config) {
        needsGroupBy = true;
      } else {
        const resolution = resolvePathSegments(metadata, baseTableName, fullPath);
        const hasArrayRelation = resolution.nodes.some((n) => n.isArray);
        if (hasArrayRelation) {
          needsGroupBy = true;
        }
      }
    });
  }

  // 3. Analyze Projection (Rule B: outer joins for hydration)
  if (query.projection && Array.isArray(query.projection)) {
    for (const path of query.projection) {
      const resolution = resolvePathSegments(metadata, baseTableName, path as string);
      const relPath = resolution.relationPath;
      if (relPath) {
        addPathWithParents(outerPaths, relPath);
      }
    }
  }

  logger.debug(`Analysis complete. Found ${ctePaths.size} CTE paths and ${outerPaths.size} outer paths.`);
  if (ctePaths.size > 0) logger.trace(`CTE Paths: ${Array.from(ctePaths).join(", ")}`);
  if (outerPaths.size > 0) logger.trace(`Outer Paths: ${Array.from(outerPaths).join(", ")}`);

  return { ctePaths, outerPaths, needsGroupBy };
}

export function extractFilterPaths(
  filter: any,
  paths: Set<string>,
  metadata: any,
  baseTableName: string
) {
  if (!filter || typeof filter !== "object") return;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or") {
      if (Array.isArray(value)) {
        for (const item of value) {
          extractFilterPaths(item, paths, metadata, baseTableName);
        }
      }
    } else if (key === "$not") {
      extractFilterPaths(value, paths, metadata, baseTableName);
    } else if (!key.startsWith("$")) {
      const relationPath = getRelationPath(key, metadata, baseTableName);
      if (relationPath) {
        addPathWithParents(paths, relationPath);
      }
    }
  }
}

export function extractOrderPaths(
  order: any,
  paths: Set<string>,
  metadata: any,
  baseTableName: string,
  onField: (fullPath: string, config: any) => void,
) {
  if (!order || typeof order !== "object") return;

  for (const [key, value] of Object.entries(order)) {
    const relationPath = getRelationPath(key, metadata, baseTableName);
    if (relationPath) {
      addPathWithParents(paths, relationPath);
    }
    onField(key, value);
  }
}
