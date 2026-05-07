import { eq, inArray } from "drizzle-orm";
import { buildSearchQueries, hydrateResults, type TranslatorContext } from "../query-parser";
import type { DbAction } from "../types";
import { getPrimaryKeyColumnName } from "./create";

export async function executeHardDeleteOne(
  id: string | number,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<boolean> {
  checkAccess("hardDelete", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);

  const filter = { [pkName]: { $eq: id } };

  if (hooks?.beforeHardDelete) {
    await hooks.beforeHardDelete(filter);
  }

  // To provide the 'affected' entities to afterHardDelete, we need to fetch them before deleting
  let entitiesToDelete: any[] = [];
  if (hooks?.afterHardDelete) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = buildSearchQueries(query as any, translatorContext, true);
    const rawRows = await mainQuery;
    entitiesToDelete = hydrateResults(rawRows, baseTableName, metadata, pkName);
  }

  const pkColumn = baseTable[pkName];

  await db
    .delete(baseTable)
    .where(eq(pkColumn, id));

  // SQLite driver doesn't consistently return affected rows in a standard way across all bundlers,
  // but usually it's checked via some property if not using returning().
  // Assuming if it didn't throw, we consider it executed. 
  // We can return true if entitiesToDelete was found, or just return true.
  
  if (hooks?.afterHardDelete && entitiesToDelete.length > 0) {
    await hooks.afterHardDelete(entitiesToDelete);
  }

  return true;
}

export async function executeHardDeleteMany(
  filter: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<number> {
  checkAccess("hardDelete", profile);

  if (hooks?.beforeHardDelete) {
    await hooks.beforeHardDelete(filter);
  }

  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  // Find affected IDs using the query parser
  const searchQuery = {
    filter,
    projection: [pkName],
  };

  const { mainQuery } = buildSearchQueries(searchQuery as any, translatorContext, false);
  const rawRows = await mainQuery;
  const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);
  const affectedIds = hydratedData.map((e) => e[pkName]);

  if (affectedIds.length === 0) {
    return 0; // Nothing to delete
  }

  // We need to fetch full entities if afterHardDelete hook exists
  let entitiesToDelete = hydratedData;
  if (hooks?.afterHardDelete) {
    // If projection was restricted to pkName, we should fetch the full objects
    const fullSearchQuery = {
      filter: { [pkName]: { $inArray: affectedIds } },
    };
    const { mainQuery: fullMainQuery } = buildSearchQueries(fullSearchQuery as any, translatorContext, false);
    const fullRawRows = await fullMainQuery;
    entitiesToDelete = hydrateResults(fullRawRows, baseTableName, metadata, pkName);
  }

  await db
    .delete(baseTable)
    .where(inArray(pkColumn, affectedIds));

  if (hooks?.afterHardDelete) {
    await hooks.afterHardDelete(entitiesToDelete);
  }

  return affectedIds.length;
}
