import { eq } from "drizzle-orm";
import { buildSearchQueries, hydrateResults, isFilterSimple, parseFilter, buildExistsCondition } from "../query-parser";
import { getPrimaryKeyColumnName } from "../helper";
import type { MiddlewareContext } from "../middleware/index";

export async function executeHardDeleteOne(
  ctx: MiddlewareContext,
  baseTable: any,
): Promise<boolean> {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);

  const filter = { [pkName]: { $eq: params.id } };

  // Fetch full entity so hooks middleware can use it
  const query = { filter, page: 1, pageSize: 1 };
  const { mainQuery, paths } = await buildSearchQueries(query as any, translatorContext, true);
  const rawRows = await mainQuery;
  const entitiesToDelete = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
  
  ctx.state.affectedRecords = entitiesToDelete;

  const pkColumn = baseTable[pkName];

  await db
    .delete(baseTable)
    .where(eq(pkColumn, params.id));

  return true;
}

export async function executeHardDeleteMany(
  ctx: MiddlewareContext,
  baseTable: any,
): Promise<number> {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);

  // Fetch full entities BEFORE deletion
  const { mainQuery, paths } = await buildSearchQueries({ filter: params.filter } as any, translatorContext, false);
  const rawRows = await mainQuery;
  const entitiesToDelete = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
  
  ctx.state.affectedRecords = entitiesToDelete;
  
  if (entitiesToDelete.length === 0) return 0;

  // Step 1: Detect if simple or complex
  const isSimple = isFilterSimple(params.filter, metadata, baseTableName);
  let deletedCount = 0;

  if (isSimple) {
    const whereAst = parseFilter(params.filter, baseTable, new Map(), metadata, baseTableName, db);
    const result: any = await db.delete(baseTable).where(whereAst);
    deletedCount = result.rowsAffected ?? entitiesToDelete.length;
  } else {
    // Complex Delete: use correlated EXISTS subquery for true atomicity
    const existsCond = await buildExistsCondition(params.filter, translatorContext, baseTable);
    const result: any = await db.delete(baseTable).where(existsCond);
    deletedCount = result.rowsAffected ?? entitiesToDelete.length;
  }

  // If no rowsAffected is returned (like in Postgres without returning), fallback to the known length if fetched
  return deletedCount === -1 ? entitiesToDelete.length : deletedCount;
}
