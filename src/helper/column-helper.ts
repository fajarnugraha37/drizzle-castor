import { getTableColumns } from "drizzle-orm";

/**
 * Extracts the primary key column name from a Drizzle table.
 * Fallbacks to 'id' if no primary key is explicitly marked.
 */
export function getPrimaryKeyColumnName(baseTable: any): string {
  const cols = getTableColumns(baseTable);
  for (const [key, col] of Object.entries(cols)) {
    if ((col as any).primary) {
      return key;
    }
  }
  return "id";
}
