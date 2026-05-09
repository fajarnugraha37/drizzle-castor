import { supportsReturning } from "../helper/dialect-helper";
import { buildSearchQueries, hydrateResults } from "../query-parser";
import { MutationError } from "../errors";
import type { ExecutionContext } from "../types/context";

/**
 * Executes a single record creation (One) with dialect-aware re-hydration.
 */
export async function executeCreateOneMutation(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
  pkName: string,
  data: any
): Promise<any | null> {
  const { translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;

  return await db.transaction(async (tx: any) => {
    try {
      let insertedId: any;

      if (supportsReturning(db)) {
        const result = await tx.insert(baseTable).values(data).returning();
        if (!result || result.length === 0) return null;
        insertedId = result[0][pkName];
      } else {
        // MySQL fallback: Use insertId
        const result = await tx.insert(baseTable).values(data);
        insertedId = result[0].insertId;
      }

      if (insertedId === undefined) return null;

      const { mainQuery, paths } = await buildSearchQueries(
        { filter: { [pkName]: { $eq: insertedId } }, page: 1, pageSize: 1 } as any,
        { ...translatorContext, db: tx },
        true
      );
      const rawRows = await mainQuery;
      const hydrated = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
      return hydrated.length > 0 ? hydrated[0] : null;
    } catch (error: any) {
      if (error instanceof MutationError) throw error;
      throw new MutationError(`Create failed: ${error.message}`, error);
    }
  });
}

/**
 * Executes multiple record creation (Many) with dialect-aware re-hydration.
 */
export async function executeCreateManyMutation(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
  pkName: string,
  data: any[]
): Promise<any[]> {
  const { translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;

  if (!data || data.length === 0) return [];

  return await db.transaction(async (tx: any) => {
    try {
      let insertedIds: any[] = [];

      if (supportsReturning(db)) {
        const result = await tx.insert(baseTable).values(data).returning();
        insertedIds = result.map((row: any) => row[pkName]);
      } else {
        // MySQL best-effort re-hydration
        const result = await tx.insert(baseTable).values(data);
        const firstId = result[0].insertId;
        const affectedRows = result[0].affectedRows;
        
        if (firstId && affectedRows) {
           // Assumption: contiguous IDs for auto-increment in a single batch insert
           for (let i = 0; i < affectedRows; i++) {
             insertedIds.push(firstId + i);
           }
        }
      }

      if (insertedIds.length === 0) return [];

      const { mainQuery, paths } = await buildSearchQueries(
        { filter: { [pkName]: { $inArray: insertedIds } } } as any,
        { ...translatorContext, db: tx },
        false
      );
      const rawRows = await mainQuery;
      return hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
    } catch (error: any) {
      if (error instanceof MutationError) throw error;
      throw new MutationError(`Batch create failed: ${error.message}`, error);
    }
  });
}
