import { resolveProviderValues, injectSoftDeleteFilter, getPrimaryKeyColumnName, getSoftDeleteConfig } from "../helper";
import { parseUpdateSet as parseUpdateSetParser } from "../query-parser";
import { executeBatchMutation } from "./batch-executor";
import { executeSingleMutation } from "./single-executor";
import { supportsReturning } from "../helper/dialect-helper";
import type { ExecutionContext } from "../types/context";
import { logger } from "../helper/logger-helper";

export async function executeSoftDeleteOne(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
): Promise<boolean> {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  logger.debug(`Executing softDeleteOne for ${baseTableName} with ID ${params.id}`);
  const config = getSoftDeleteConfig(metadata, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.id) return false;

  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSetParser(db, baseTable, setParams);

  // Search filter: only target records that are currently active
  const searchFilter = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: params.id } },
  }, metadata, baseTableName, "active");

  // Rehydrate filter: find the record that is now deleted
  const rehydrateFilter = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: params.id } },
  }, metadata, baseTableName, "deleted");

  const result = await executeSingleMutation(
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
    params.id,
    searchFilter.filter,
    rehydrateFilter.filter
  );

  if (result) {
    ctx.state.affectedRecords = [result];
    translatorContext.emitter?.emit("soft-deleted", {
      tableName: baseTableName,
      action: "softDelete",
      records: [result],
      traceId: ctx.traceId
    });
    return true;
  }

  return false;
}

export async function executeSoftDeleteMany(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
): Promise<number> {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  logger.debug(`Executing softDeleteMany for ${baseTableName}`);
  const config = getSoftDeleteConfig(metadata, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  const setParams = await resolveProviderValues(config.deleteValue);
  const parsedSetParams = parseUpdateSetParser(db, baseTable, setParams);

  const searchFilter = await injectSoftDeleteFilter({ filter: params.filter }, metadata, baseTableName, "active");
  const rehydrateFilter = await injectSoftDeleteFilter({ filter: params.filter }, metadata, baseTableName, "deleted");

  const results = await executeBatchMutation(
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
    searchFilter.filter,
    rehydrateFilter.filter
  );

  ctx.state.affectedRecords = results;
  if (results.length > 0) {
    translatorContext.emitter?.emit("soft-deleted", {
      tableName: baseTableName,
      action: "softDelete",
      records: results,
      traceId: ctx.traceId
    });
  }
  return results.length;
}
