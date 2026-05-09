import { getPrimaryKeyColumnName } from "../helper";
import { executeBatchMutation } from "./batch-executor";
import { executeSingleMutation } from "./single-executor";
import { supportsReturning } from "../helper/dialect-helper";
import type { ExecutionContext } from "../types/context";

export async function executeHardDeleteOne(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
): Promise<boolean> {
  const { params } = ctx;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  if (!params.id) return false;

  const result = await executeSingleMutation(
    ctx,
    baseTable,
    pkName,
    async (tx, whereClause) => {
      const qb = tx.delete(baseTable).where(whereClause);
      
      if (supportsReturning(tx)) {
        const r = await qb.returning({ [pkName]: pkColumn });
        return r.map((i: any) => i[pkName]);
      } else {
        const res: any = await qb;
        return res[0]?.affectedRows ?? res.affectedRows ?? 0;
      }
    },
    params.id,
    undefined, // Default ID filter
    undefined, // No re-hydration after delete
    true // HYDRATE BEFORE DELETE
  );

  if (result) {
    ctx.state.affectedRecords = [result];
    ctx.translatorContext.emitter?.emit("hard-deleted", {
      tableName: ctx.translatorContext.baseTableName,
      action: "hardDelete",
      records: [result],
      traceId: ctx.traceId
    });
    return true;
  }

  return false;
}

export async function executeHardDeleteMany(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
): Promise<number> {
  const { params } = ctx;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = baseTable[pkName];

  const results = await executeBatchMutation(
    ctx,
    baseTable,
    pkName,
    async (tx, whereClause) => {
      const qb = tx.delete(baseTable).where(whereClause);
      
      if (supportsReturning(tx)) {
        const r = await qb.returning({ [pkName]: pkColumn });
        return r.map((i: any) => i[pkName]);
      } else {
        const res: any = await qb;
        return res[0]?.affectedRows ?? res.affectedRows ?? 0;
      }
    },
    params.filter,
    undefined, // No re-hydration after delete
    true // HYDRATE BEFORE DELETE
  );

  ctx.state.affectedRecords = results;
  if (results.length > 0) {
    ctx.translatorContext.emitter?.emit("hard-deleted", {
      tableName: ctx.translatorContext.baseTableName,
      action: "hardDelete",
      records: results,
      traceId: ctx.traceId
    });
  }
  return results.length;
}
