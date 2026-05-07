export type RelationType =
  | "oneToMany"
  | "manyToMany"
  | "oneToOne"
  | "manyToOne";

export type RelationNode = {
  relationName: string;
  relatedTable: string;
  type: RelationType;
  isArray: boolean;
  foreignKey?: string;
  localKey?: string;
  joinTable?: string;
  joinLocalKey?: string;
  relatedKey?: string;
  joinRelatedKey?: string;
};

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

/**
 * Resolves a full dot-notation path (e.g., "posts.comments") into an array of RelationNodes.
 * Validates that each segment of the path actually exists in the schema metadata.
 */
export function resolveRelationPath(
  metadata: any,
  baseTableName: string,
  path: string,
): RelationNode[] {
  const parts = path.split(".");
  const nodes: RelationNode[] = [];
  let currentTable = baseTableName;

  for (const part of parts) {
    const node = findRelationDefinition(metadata, currentTable, part);
    if (!node) {
      throw new Error(
        `Relation '${part}' not found on table '${currentTable}'.`,
      );
    }
    nodes.push(node);
    currentTable = node.relatedTable;
  }

  return nodes;
}
