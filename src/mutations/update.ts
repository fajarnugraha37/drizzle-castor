import { buildSearchQueries, hydrateResults, parseUpdateSet, injectSoftDeleteFilter, isFilterSimple, parseFilter, buildExistsCondition, type TranslatorContext } from "../query-parser";
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
    await hooks.beforeUpdate(setParams, { [pkName]: { $eq: id } });
  }

  // ATOMIC UPDATE: Combine soft delete check and ID check in a single WHERE clause
  const searchQuery = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: id } },
  }, metadata, baseTableName, "active");

  const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(whereAst)
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return null; // Record not found or it is soft-deleted
  }

  // Re-hydrate the updated record using query-parser (only if needed for return or hooks)
  const query = {
    filter: { [pkName]: { $eq: id } },
    page: 1,
    pageSize: 1,
  };

  const { mainQuery } = await buildSearchQueries(query as any, translatorContext, true);
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

  // Step 1: Inject soft delete filter
  const searchQuery = await injectSoftDeleteFilter({
    filter,
    projection: [pkName],
  }, metadata, baseTableName, "active");

  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  let affectedIds: any[] = [];

  // Step 2: Determine if we can do a direct update or need a correlated EXISTS
  if (isFilterSimple(searchQuery.filter, metadata, baseTableName)) {
    // Direct Update: single query, no subqueries
    const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
    const updateResult = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(whereAst)
      .returning({ id: pkColumn });
    affectedIds = updateResult.map((r: any) => r.id);
  } else {
    // Complex Update: use Correlated EXISTS subquery for true atomicity and zero materialization
    const existsCond = await buildExistsCondition(searchQuery.filter, translatorContext, baseTable);
    const updateResult = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(existsCond)
      .returning({ id: pkColumn });
    affectedIds = updateResult.map((r: any) => r.id);
  }

  if (affectedIds.length === 0) {
    return [];
  }

  // Step 3: Re-hydrate updated records ONLY if hooks exist, WITHOUT using IN clauses
  if (hooks?.afterUpdate) {
    // We use the exact same filter to retrieve the updated data natively via SQL JOINS/EXISTS
    const rehydrateSearchQuery = await injectSoftDeleteFilter({
      filter,
    }, metadata, baseTableName, "active");

    const { mainQuery: hydrationQuery } = await buildSearchQueries(rehydrateSearchQuery as any, translatorContext, false);
    const hydratedRows = await hydrationQuery;
    const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);

    await hooks.afterUpdate(setParams, hydratedData);
    return hydratedData;
  }

  return affectedIds.map(id => ({ [pkName]: id }));
}
