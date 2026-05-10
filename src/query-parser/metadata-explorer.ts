import "./../polyfills";
import { Cache } from "@stacksjs/ts-cache";
import { QueryParsingError } from "../errors";
import type { PathResolution, RelationNode, RelationType } from "../types";

export const resolutionCache = new Cache({
  stdTTL: 600,
  maxKeys: 5000,
  checkPeriod: 60,
  useClones: false,
  deleteOnExpire: true,
  maxPerformance: true,
  enableStats: false,
  enableEvents: false,
});

/**
 * Clears the internal resolution cache.
 * Useful for testing scenarios where metadata might change dynamically.
 */
export function clearResolutionCache(): void {
  resolutionCache.flushAll();
}

/**
 * Traverses the metadata to find the relation definition for a given relation name.
 */
export function findRelationDefinition(
  metadata: any,
  tableName: string,
  relationName: string,
): RelationNode | null {
  const tableMeta = metadata[tableName];
  if (!tableMeta) return null;

  const relationTypes: RelationType[] = [
    "oneToMany",
    "manyToMany",
    "oneToOne",
    "manyToOne",
  ];

  for (const relType of relationTypes) {
    const relations = tableMeta[relType] as any[];
    if (relations) {
      const found = relations.find((r) => r.relationName === relationName);
      if (found) {
        return {
          ...found,
          type: relType,
          isArray: relType === "oneToMany" || relType === "manyToMany",
        };
      }
    }
  }

  return null;
}

export function isRelation(metadata: any, tableName: string, relationName: string): boolean {
  return findRelationDefinition(metadata, tableName, relationName) !== null;
}

/**
 * Resolves a full dot-notation path (e.g., "posts.persona.hobbies") into an array of RelationNodes
 * and extracts the remaining JSON path if it hits a column instead of a relation.
 */
export function resolvePathSegments(
  metadata: any,
  baseTableName: string,
  path: string,
): PathResolution {
  const cacheKey = `${baseTableName}:${path}`;
  const cached = resolutionCache.get<PathResolution>(cacheKey);
  if (cached) {
    return cached;
  }

  const parts = path.split(".");
  const nodes: RelationNode[] = [];
  let currentTable = baseTableName;
  let jsonPathSegments: string[] = [];
  let relationPathSegments: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const node = findRelationDefinition(metadata, currentTable, part);
    
    if (!node) {
      // If not a relation, the rest of the path belongs to a JSON column
      jsonPathSegments = parts.slice(i);
      break;
    }
    
    nodes.push(node);
    relationPathSegments.push(part);
    currentTable = node.relatedTable;
  }

  const result: PathResolution = {
    nodes,
    jsonPath: jsonPathSegments.length > 0 ? jsonPathSegments.join(".") : undefined,
    relationPath: relationPathSegments.join(".")
  };

  resolutionCache.set(cacheKey, result);
  return result;
}

/**
 * Backward compatibility for places that expect purely relational paths.
 */
export function resolveRelationPath(
  metadata: any,
  baseTableName: string,
  path: string,
): RelationNode[] {
  const resolution = resolvePathSegments(metadata, baseTableName, path);
  if (resolution.jsonPath) {
    throw new QueryParsingError(`Path '${path}' contains non-relational segment '${resolution.jsonPath.split('.')[0]}'`);
  }
  return resolution.nodes;
}
