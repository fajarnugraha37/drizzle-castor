import { eq } from "drizzle-orm";
import { buildSearchQueries, hydrateResults, isFilterSimple, parseFilter, buildExistsCondition, type TranslatorContext } from "../query-parser";
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

  // Fetch full entity only if needed for hooks
  let entitiesToDelete: any[] = [];
  if (hooks?.afterHardDelete) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = await buildSearchQueries(query as any, translatorContext, true);
    const rawRows = await mainQuery;
    entitiesToDelete = hydrateResults(rawRows, baseTableName, metadata, pkName);
  }

  const pkColumn = baseTable[pkName];

  await db
    .delete(baseTable)
    .where(eq(pkColumn, id));

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

  // Fetch full entities BEFORE deletion if hooks exist (Using original filter natively via joins/exists)
  let entitiesToDelete: any[] = [];
  if (hooks?.afterHardDelete) {
    const { mainQuery } = await buildSearchQueries({ filter } as any, translatorContext, false);
    const rawRows = await mainQuery;
    entitiesToDelete = hydrateResults(rawRows, baseTableName, metadata, pkName);
    
    if (entitiesToDelete.length === 0) return 0;
  }

  // Step 1: Detect if simple or complex
  const isSimple = isFilterSimple(filter, metadata, baseTableName);
  let deletedCount = 0;

  if (isSimple) {
    const whereAst = parseFilter(filter, baseTable, new Map(), metadata, baseTableName, db);
    const result: any = await db.delete(baseTable).where(whereAst);
    deletedCount = result.rowsAffected ?? entitiesToDelete.length;
  } else {
    // Complex Delete: use correlated EXISTS subquery for true atomicity
    const existsCond = await buildExistsCondition(filter, translatorContext, baseTable);
    const result: any = await db.delete(baseTable).where(existsCond);
    deletedCount = result.rowsAffected ?? entitiesToDelete.length;
  }

  if (hooks?.afterHardDelete && entitiesToDelete.length > 0) {
    await hooks.afterHardDelete(entitiesToDelete);
  }

  // If no rowsAffected is returned (like in Postgres without returning), fallback to the known length if fetched
  return deletedCount === -1 ? entitiesToDelete.length : deletedCount;
}
