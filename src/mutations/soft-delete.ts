import { buildSearchQueries, hydrateResults, parseUpdateSet, resolveProviderValues, isFilterSimple, parseFilter, injectSoftDeleteFilter, buildExistsCondition, type TranslatorContext } from "../query-parser";
import type { DbAction, SoftDeleteConfig } from "../types";
import { getPrimaryKeyColumnName } from "./create";

function getSoftDeleteConfig(metadata: any, tableName: string): SoftDeleteConfig<any> {
  const config = metadata[tableName]?.softDelete;
  if (!config) {
    throw new Error(`Soft delete is not configured for table '${tableName}'`);
  }
  return config;
}

export async function executeSoftDeleteOne(
  id: string | number,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<boolean> {
  checkAccess("softDelete", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const config = getSoftDeleteConfig(metadata, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);

  const filter = { [pkName]: { $eq: id } };

  if (hooks?.beforeSoftDelete) {
    await hooks.beforeSoftDelete(filter);
  }

  // ATOMIC UPDATE: Single query for single record soft delete
  const searchQuery = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: id } },
  }, metadata, baseTableName, "active");

  const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(whereAst)
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return false; // Not found or already deleted
  }

  if (hooks?.afterSoftDelete) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = await buildSearchQueries(query as any, translatorContext, true);
    const rawRows = await mainQuery;
    const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);
    await hooks.afterSoftDelete(hydratedData);
  }

  return true;
}

export async function executeSoftDeleteMany(
  filter: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<number> {
  checkAccess("softDelete", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const config = getSoftDeleteConfig(metadata, baseTableName);

  if (hooks?.beforeSoftDelete) {
    await hooks.beforeSoftDelete(filter);
  }

  const pkName = getPrimaryKeyColumnName(baseTable);

  // 1. Inject soft delete filter
  const searchQuery = await injectSoftDeleteFilter({
    filter,
  }, metadata, baseTableName, "active");

  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  let deletedCount = 0;

  // 2. Execute Update (Atomically)
  if (isFilterSimple(searchQuery.filter, metadata, baseTableName)) {
    const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
    const updateResult: any = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(whereAst);
    deletedCount = updateResult.rowsAffected ?? -1;
  } else {
    // Correlated EXISTS: No materialization, true atomic batch update
    const existsCond = await buildExistsCondition(searchQuery.filter, translatorContext, baseTable);
    const updateResult: any = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(existsCond);
    deletedCount = updateResult.rowsAffected ?? -1;
  }

  if (deletedCount === 0) return 0;

  // 3. Hydrate and trigger hook ONLY if hooks exist
  if (hooks?.afterSoftDelete) {
    // Re-fetch using original filter, but looking in DELETED mode since they are now deleted
    const rehydrateSearchQuery = await injectSoftDeleteFilter({
      filter,
    }, metadata, baseTableName, "deleted");

    const { mainQuery: hydrationQuery } = await buildSearchQueries(rehydrateSearchQuery as any, translatorContext, false);
    const hydratedRows = await hydrationQuery;
    const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);
    
    await hooks.afterSoftDelete(hydratedData);
    if (deletedCount === -1) deletedCount = hydratedData.length;
  }

  return deletedCount;
}

export async function executeRestoreOne(
  id: string | number,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<boolean> {
  checkAccess("restore", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const config = getSoftDeleteConfig(metadata, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);

  const filter = { [pkName]: { $eq: id } };

  if (hooks?.beforeRestore) {
    await hooks.beforeRestore(filter);
  }

  // ATOMIC UPDATE: Single query restore
  const searchQuery = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: id } },
  }, metadata, baseTableName, "deleted");

  const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
  const setParams = await resolveProviderValues(config.restoreValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(whereAst)
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return false; // Not found or already active
  }

  if (hooks?.afterRestore) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = await buildSearchQueries(query as any, translatorContext, true);
    const rawRows = await mainQuery;
    const hydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName);
    await hooks.afterRestore(hydratedData);
  }

  return true;
}

export async function executeRestoreMany(
  filter: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  baseTable: any,
): Promise<number> {
  checkAccess("restore", profile);

  const { db, metadata, baseTableName } = translatorContext;
  const config = getSoftDeleteConfig(metadata, baseTableName);

  if (hooks?.beforeRestore) {
    await hooks.beforeRestore(filter);
  }

  const pkName = getPrimaryKeyColumnName(baseTable);

  // 1. Inject soft delete filter (searching for DELETED records to restore)
  const searchQuery = await injectSoftDeleteFilter({
    filter,
  }, metadata, baseTableName, "deleted");

  const setParams = await resolveProviderValues(config.restoreValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  let restoredCount = 0;

  // 2. Execute Update (Atomically)
  if (isFilterSimple(searchQuery.filter, metadata, baseTableName)) {
    const whereAst = parseFilter(searchQuery.filter, baseTable, new Map(), metadata, baseTableName, db);
    const updateResult: any = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(whereAst);
    restoredCount = updateResult.rowsAffected ?? -1;
  } else {
    // Correlated EXISTS: No materialization, true atomic batch update
    const existsCond = await buildExistsCondition(searchQuery.filter, translatorContext, baseTable);
    const updateResult: any = await db
      .update(baseTable)
      .set(parsedSetParams)
      .where(existsCond);
    restoredCount = updateResult.rowsAffected ?? -1;
  }

  if (restoredCount === 0) return 0;

  // 3. Hydrate and trigger hook ONLY if hooks exist
  if (hooks?.afterRestore) {
    // Re-fetch using original filter, but looking in ACTIVE mode since they are now restored
    const rehydrateSearchQuery = await injectSoftDeleteFilter({
      filter,
    }, metadata, baseTableName, "active");

    const { mainQuery: hydrationQuery } = await buildSearchQueries(rehydrateSearchQuery as any, translatorContext, false);
    const hydratedRows = await hydrationQuery;
    const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);
    
    await hooks.afterRestore(hydratedData);
    if (restoredCount === -1) restoredCount = hydratedData.length;
  }

  return restoredCount;
}
