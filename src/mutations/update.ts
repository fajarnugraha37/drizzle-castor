import { eq, inArray } from "drizzle-orm";
import { buildSearchQueries, hydrateResults, type TranslatorContext } from "../query-parser";
import type { DbAction } from "../types";
import { getPrimaryKeyColumnName } from "./create";

export async function executeUpdateOne(
  id: string | number,
  setParams: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
) {
  checkAccess("update", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);

  if (hooks?.beforeUpdate) {
    // Pass the affected filter condition
    await hooks.beforeUpdate(setParams, { [pkName]: { $eq: id } });
  }

  const pkColumn = baseTable[pkName];

  // Execute update
  const updateResult = await db
    .update(baseTable)
    .set(setParams)
    .where(eq(pkColumn, id))
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return null; // Record not found or not updated
  }

  // Re-hydrate the updated record using query-parser
  const query = {
    filter: { [pkName]: { $eq: id } },
    page: 1,
    pageSize: 1,
  };

  const { mainQuery } = buildSearchQueries(query as any, translatorContext, true);
  const rawRows = await mainQuery;
  const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);

  const entity = hydratedData.length > 0 ? hydratedData[0] : null;

  if (hooks?.afterUpdate && entity) {
    await hooks.afterUpdate(setParams, [entity]);
  }

  return entity;
}

export async function executeUpdateMany(
  filter: any,
  setParams: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
) {
  checkAccess("update", profile);

  if (hooks?.beforeUpdate) {
    await hooks.beforeUpdate(setParams, filter);
  }

  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  // Step 1: Find affected IDs using our powerful query parser (handles nested relational filters)
  const searchQuery = {
    filter,
    projection: [pkName], // Only fetch ID to save memory
  };

  const { mainQuery } = buildSearchQueries(searchQuery as any, translatorContext, false);
  const rawRows = await mainQuery;
  const affectedIds = hydrateResults(rawRows, baseTableName, metadata, pkName).map((e) => e[pkName]);

  if (affectedIds.length === 0) {
    return []; // Nothing to update
  }

  // Step 2: Execute batch update
  const updateResult = await db
    .update(baseTable)
    .set(setParams)
    .where(inArray(pkColumn, affectedIds))
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return [];
  }

  // Step 3: Re-hydrate the updated records
  const rehydrateQuery = {
    filter: { [pkName]: { $inArray: affectedIds } },
  };

  const { mainQuery: hydrationQuery } = buildSearchQueries(rehydrateQuery as any, translatorContext, false);
  const hydratedRows = await hydrationQuery;
  const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);

  if (hooks?.afterUpdate) {
    await hooks.afterUpdate(setParams, hydratedData);
  }

  return hydratedData;
}
