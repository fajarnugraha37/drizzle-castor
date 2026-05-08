import { buildSearchQueries, hydrateResults, parseUpdateSet, isFilterSimple, parseFilter, buildExistsCondition } from "../query-parser";
import { getPrimaryKeyColumnName, injectSoftDeleteFilter } from "../helper";
import type { MiddlewareContext } from "../middleware/index";

export async function executeUpdateOne(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);

  if (!params.set) return null;

  // ATOMIC UPDATE: Combine soft delete check and ID check in a single WHERE clause
  const searchQuery = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: params.id } },
  }, metadata, baseTableName, "active");

  const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
  const parsedSetParams = parseUpdateSet(db, baseTable, params.set);

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(whereAst)
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return null; // Record not found or it is soft-deleted
  }

  // Re-hydrate the updated record using query-parser
  const query = {
    filter: { [pkName]: { $eq: params.id } },
    page: 1,
    pageSize: 1,
  };

  const { mainQuery } = await buildSearchQueries(query as any, translatorContext, true);
  const rawRows = await mainQuery;
  const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);

  return hydratedData.length > 0 ? hydratedData[0] : null;
}

export async function executeUpdateMany(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.set) return [];

  // Step 1: Inject soft delete filter
  const searchQuery = await injectSoftDeleteFilter({
    filter: params.filter,
    projection: [pkName],
  }, metadata, baseTableName, "active");

  const parsedSetParams = parseUpdateSet(db, baseTable, params.set);

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

  // We use the exact same filter to retrieve the updated data natively via SQL JOINS/EXISTS
  const rehydrateSearchQuery = await injectSoftDeleteFilter({
    filter: params.filter,
  }, metadata, baseTableName, "active");

  const { mainQuery: hydrationQuery } = await buildSearchQueries(rehydrateSearchQuery as any, translatorContext, false);
  const hydratedRows = await hydrationQuery;
  return hydrateResults(hydratedRows, baseTableName, metadata, pkName);
}
