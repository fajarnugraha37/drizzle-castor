import { getTableColumns } from "drizzle-orm";
import { buildSearchQueries, hydrateResults } from "../query-parser";
import { MutationError } from "../errors";
import type { MiddlewareContext } from "../middleware/index";

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

export async function executeCreateOne(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  
  // Execute insert
  const insertResult = await db.insert(baseTable).values(params.data).returning();
  
  if (!insertResult || insertResult.length === 0) {
    throw new MutationError(`Failed to insert record into table '${baseTableName}'`);
  }
  
  const pkName = getPrimaryKeyColumnName(baseTable);
  const insertedId = insertResult[0][pkName];

  // Re-hydrate the inserted record using query-parser
  const query = {
    filter: { [pkName]: { $eq: insertedId } },
    page: 1,
    pageSize: 1
  };
  
  const { mainQuery, paths } = await buildSearchQueries(query as any, translatorContext, true);
  const rawRows = await mainQuery;
  const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
  
  return hydratedData.length > 0 ? hydratedData[0] : null;
}

export async function executeCreateMany(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;

  if (!params.data || params.data.length === 0) return [];
  
  // Execute batch insert
  const insertResult = await db.insert(baseTable).values(params.data).returning();
  
  if (!insertResult || insertResult.length === 0) {
    throw new MutationError(`Failed to insert records into table '${baseTableName}'`);
  }
  
  const pkName = getPrimaryKeyColumnName(baseTable);
  const insertedIds = insertResult.map((row: any) => row[pkName]);

  // Re-hydrate the inserted records
  const query = {
    filter: { [pkName]: { $inArray: insertedIds } },
  };
  
  const { mainQuery } = await buildSearchQueries(query as any, translatorContext, false);
  const rawRows = await mainQuery;
  
  return hydrateResults(rawRows, baseTableName, metadata, pkName);
}
