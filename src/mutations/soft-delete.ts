import { buildSearchQueries, hydrateResults, parseUpdateSet, type TranslatorContext } from "../query-parser";
import type { DbAction, SoftDeleteConfig } from "../types";
import { getPrimaryKeyColumnName } from "./create";
import { eq, inArray } from "drizzle-orm";

/**
 * Resolves static values, synchronous functions, or asynchronous promises
 * defined in the SoftDeleteConfig into a raw object.
 */
async function resolveProviderValues(configObj: any): Promise<Record<string, any>> {
  if (!configObj) return {};
  
  const resolved: Record<string, any> = {};
  for (const [key, provider] of Object.entries(configObj)) {
    if (typeof provider === "function") {
      resolved[key] = await provider();
    } else {
      resolved[key] = provider;
    }
  }
  return resolved;
}

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

  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);
  const pkColumn = baseTable[pkName];

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(eq(pkColumn, id))
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return false; // Not found
  }

  if (hooks?.afterSoftDelete) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = buildSearchQueries(query as any, translatorContext, true);
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
  const pkColumn = baseTable[pkName];

  // 1. Find affected IDs
  const searchQuery = { filter, projection: [pkName] };
  const { mainQuery } = buildSearchQueries(searchQuery as any, translatorContext, false);
  const rawRows = await mainQuery;
  const affectedIds = hydrateResults(rawRows, baseTableName, metadata, pkName).map((e) => e[pkName]);

  if (affectedIds.length === 0) return 0;

  // 2. Perform Update
  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(inArray(pkColumn, affectedIds));

  // 3. Hydrate and trigger hook
  if (hooks?.afterSoftDelete) {
    const rehydrateQuery = { filter: { [pkName]: { $inArray: affectedIds } } };
    const { mainQuery: hydrationQuery } = buildSearchQueries(rehydrateQuery as any, translatorContext, false);
    const hydratedRows = await hydrationQuery;
    const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);
    await hooks.afterSoftDelete(hydratedData);
  }

  return affectedIds.length;
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

  const setParams = await resolveProviderValues(config.restoreValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);
  const pkColumn = baseTable[pkName];

  const updateResult = await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(eq(pkColumn, id))
    .returning();

  if (!updateResult || updateResult.length === 0) {
    return false; // Not found
  }

  if (hooks?.afterRestore) {
    const query = { filter, page: 1, pageSize: 1 };
    const { mainQuery } = buildSearchQueries(query as any, translatorContext, true);
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
  const pkColumn = baseTable[pkName];

  // 1. Find affected IDs
  const searchQuery = { filter, projection: [pkName] };
  const { mainQuery } = buildSearchQueries(searchQuery as any, translatorContext, false);
  const rawRows = await mainQuery;
  const affectedIds = hydrateResults(rawRows, baseTableName, metadata, pkName).map((e) => e[pkName]);

  if (affectedIds.length === 0) return 0;

  // 2. Perform Update
  const setParams = await resolveProviderValues(config.restoreValue);
  const parsedSetParams = parseUpdateSet(db, baseTable, setParams);

  await db
    .update(baseTable)
    .set(parsedSetParams)
    .where(inArray(pkColumn, affectedIds));

  // 3. Hydrate and trigger hook
  if (hooks?.afterRestore) {
    const rehydrateQuery = { filter: { [pkName]: { $inArray: affectedIds } } };
    const { mainQuery: hydrationQuery } = buildSearchQueries(rehydrateQuery as any, translatorContext, false);
    const hydratedRows = await hydrationQuery;
    const hydratedData = hydrateResults(hydratedRows, baseTableName, metadata, pkName);
    await hooks.afterRestore(hydratedData);
  }

  return affectedIds.length;
}
