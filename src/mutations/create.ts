import { getTableColumns } from "drizzle-orm";
import { buildSearchQueries, hydrateResults, type TranslatorContext } from "../query-parser";
import type { DbAction } from "../types";

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
  data: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
) {
  checkAccess("create", profile);

  if (hooks?.beforeCreate) {
    await hooks.beforeCreate(data);
  }

  const { db, metadata, baseTableName } = translatorContext;
  
  // Execute insert
  const insertResult = await db.insert(baseTable).values(data).returning();
  
  if (!insertResult || insertResult.length === 0) {
    throw new Error(`Failed to insert record into table '${baseTableName}'`);
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
  
  const entity = hydratedData.length > 0 ? hydratedData[0] : null;

  if (hooks?.afterCreate && entity) {
    await hooks.afterCreate(entity);
  }

  return entity;
}

export async function executeCreateMany(
  data: any[],
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
) {
  checkAccess("create", profile);

  if (!data || data.length === 0) return [];

  if (hooks?.beforeCreate) {
    await hooks.beforeCreate(data);
  }

  const { db, metadata, baseTableName } = translatorContext;
  
  // Execute batch insert
  const insertResult = await db.insert(baseTable).values(data).returning();
  
  if (!insertResult || insertResult.length === 0) {
    throw new Error(`Failed to insert records into table '${baseTableName}'`);
  }
  
  const pkName = getPrimaryKeyColumnName(baseTable);
  const insertedIds = insertResult.map((row: any) => row[pkName]);

  // Re-hydrate the inserted records
  const query = {
    filter: { [pkName]: { $inArray: insertedIds } },
  };
  
  const { mainQuery } = await buildSearchQueries(query as any, translatorContext, false);
  const rawRows = await mainQuery;
  const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);

  if (hooks?.afterCreate) {
    await hooks.afterCreate(hydratedData);
  }

  return hydratedData;
}
