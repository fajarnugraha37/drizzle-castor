import { injectSoftDeleteFilter, getPrimaryKeyColumnName } from "../helper";
import { parseUpdateSet } from "../query-parser";
import { executeBatchMutation } from "./batch-executor";
import { executeSingleMutation } from "./single-executor";
import { supportsReturning } from "../helper/dialect-helper";
import type { MiddlewareContext } from "../middleware/index";

export async function executeUpdateOne(
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.id || !params.set) return null;

  const parsedSetParams = parseUpdateSet(db, baseTable, params.set);

  // Search filter: only target records that are currently active
  const searchFilter = await injectSoftDeleteFilter({
    filter: { [pkName]: { $eq: params.id } },
  }, metadata, baseTableName, "active");

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
  ctx: MiddlewareContext,
  baseTable: any,
) {
  const { params, translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.set) return [];

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
