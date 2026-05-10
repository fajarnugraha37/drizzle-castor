import { injectSoftDeleteFilter, getPrimaryKeyColumnName } from "../helper";
import { parseUpdateSet } from "../query-parser";
import { executeBatchMutation } from "./batch-executor";
import { executeSingleMutation } from "./single-executor";
import { supportsReturning } from "../helper/dialect-helper";
import type { ExecutionContext } from "../types/context";
import { logger } from "../helper/logger-helper";

export async function executeUpdateOne(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  logger.debug(`Executing updateOne for ${baseTableName} with ID ${params.id}`);
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.id || !params.set) {
    logger.trace(`Missing required parameters for updateOne. ID: ${params.id}, Set: ${JSON.stringify(Object.keys(params.set || {}))}`);
    return null;
  }

  const parsedSetParams = parseUpdateSet(db, baseTable, params.set);

  // Search filter: only target records that are currently active
  const searchFilter = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: params.id } },
  }, metadata, baseTableName, "active");

  // FIX: Removed the 7th argument (explicit rehydrateFilter).
  // executeSingleMutation internally builds the re-hydration filter using params.id,
  // so passing it again here caused redundant "id = ? AND id = ?" clauses in the final SQL.
  return await executeSingleMutation(
    ctx,
    baseTable,
    pkName,
    async (tx, whereClause) => {
      const qb = tx.update(baseTable).set(parsedSetParams).where(whereClause);
      
      if (supportsReturning(tx)) {
        // Robustly map PK using current pkName
        const r = await qb.returning({ [pkName]: pkColumn });
        return r.map((i: any) => i[pkName]);
      } else {
        const res: any = await qb;
        return res[0]?.affectedRows ?? res.affectedRows ?? 0;
      }
    },
    params.id,
    searchFilter.filter
  );
}

export async function executeUpdateMany(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  logger.debug(`Executing updateMany for ${baseTableName}`);
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.set) {
    logger.trace(`Missing required parameters for updateMany. Set: ${JSON.stringify(Object.keys(params.set || {}))}`);
    return [];
  }

  const parsedSetParams = parseUpdateSet(db, baseTable, params.set);

  const searchFilter = await injectSoftDeleteFilter({
    filter: params.filter,
  }, metadata, baseTableName, "active");

  return await executeBatchMutation(
    ctx,
    baseTable,
    pkName,
    async (tx, whereClause) => {
      const qb = tx.update(baseTable).set(parsedSetParams).where(whereClause);
      
      if (supportsReturning(tx)) {
        const r = await qb.returning({ [pkName]: pkColumn });
        return r.map((i: any) => i[pkName]);
      } else {
        const res: any = await qb;
        return res[0]?.affectedRows ?? res.affectedRows ?? 0;
      }
    },
    searchFilter.filter
  );
}
