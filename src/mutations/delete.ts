import { getPrimaryKeyColumnName } from "../helper";
import { executeBatchMutation } from "./batch-executor";
import { executeSingleMutation } from "./single-executor";
import { supportsReturning } from "../helper/dialect-helper";
import type { MiddlewareContext } from "../middleware/index";

export async function executeHardDeleteOne(
  ctx: MiddlewareContext,
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
        const r = await qb.returning({ id: pkColumn });
        return r.map((i: any) => i.id);
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
    return true;
  }

  return false;
}

export async function executeHardDeleteMany(
  ctx: MiddlewareContext,
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
        const r = await qb.returning({ id: pkColumn });
        return r.map((i: any) => i.id);
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
  return results.length;
}
