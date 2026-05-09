import { TableNotFoundError } from "../errors";

/**
 * Robustly finds the base table object from the provided tables array matching the baseTableName.
 * Uses multiple name-matching strategies to handle Drizzle's internal symbol-based naming.
 * Throws TableNotFoundError if no matching table is found.
 */
export function findBaseTable(tables: readonly any[], baseTableName: string): any {
  const baseTable = tables.find((t: any) => 
    t[Symbol.for("drizzle:Name")] === baseTableName || 
    t.name === baseTableName || 
    (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName
  );

  if (!baseTable) {
    throw new TableNotFoundError(baseTableName);
  }

  return baseTable;
}
