import { getPrimaryKeyPropertyNames } from "./dialect-helper";

/**
 * Extracts the primary key column name (property name in the schema) from a Drizzle table.
 * Robustly handles both column-level and table-level (composite) definitions.
 * Fallbacks to 'id' if no primary key is explicitly marked.
 */
export function getPrimaryKeyColumnName(baseTable: any): string {
  const pkNames = getPrimaryKeyPropertyNames(baseTable);
  
  // Return the first primary key found (for single-PK biased logic)
  return pkNames[0] || "id";
}
