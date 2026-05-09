import { sql, eq, inArray } from "drizzle-orm";
import { generateTempTableName, supportsReturning, getTempTableCount } from "../helper/dialect-helper";
import { buildSearchQueries, hydrateResults, parseFilter, isFilterSimple, buildExistsCondition } from "../query-parser";
import { isMutated } from "../helper";
import { MutationError } from "../errors";
import type { ExecutionContext } from "../types/context";

/**
 * Executes a single record mutation (One) with race-condition protection.
 * Strategy A: Uses .returning() inside a transaction for efficiency and atomicity.
 * Strategy B (Fallback): Uses Temporary Tables to capture the ID before operation.
 * 
 * @param hydrateBefore If true, hydrates record BEFORE mutation (required for Hard Delete).
 */
export async function executeSingleMutation(
  ctx: ExecutionContext<any, any>,
  baseTable: any,
  pkName: string,
  mutationFn: (tx: any, whereClause: any) => Promise<any[] | number>,
  idValue: string | number,
  operationFilter?: any,
  rehydrateFilter?: any,
  hydrateBefore: boolean = false
): Promise<any | null> {
  const { translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkColumn = baseTable[pkName];

  const effectiveFilter = operationFilter || { [pkName]: { $eq: idValue } };

  // STRATEGY A: PostgreSQL / SQLite (Efficient .returning() + Transaction for BUG-3)
  if (supportsReturning(db)) {
    return await db.transaction(async (tx: any) => {
      try {
        let whereAst;
        if (isFilterSimple(effectiveFilter, metadata, baseTableName)) {
          whereAst = parseFilter(effectiveFilter, baseTable, new Map(), metadata, baseTableName, tx);
        } else {
          whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);
        }
        
        let preHydratedData: any | null = null;
        if (hydrateBefore) {
          const { mainQuery, paths } = await buildSearchQueries(
            { filter: effectiveFilter, page: 1, pageSize: 1 } as any,
            { ...translatorContext, db: tx },
            true
          );
          const rawRows = await mainQuery;
          const hydrated = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
          preHydratedData = hydrated.length > 0 ? hydrated[0] : null;
          if (!preHydratedData) return null;
        }

        const result = await mutationFn(tx, whereAst);
        
        if (!isMutated(result)) return null;
        if (hydrateBefore) return preHydratedData;

        const rehydrateQuery: any = { 
          filter: { 
            $and: [{ [pkName]: { $eq: idValue } }, rehydrateFilter].filter(Boolean)
          }, 
          page: 1, 
          pageSize: 1 
        };

        const { mainQuery, paths } = await buildSearchQueries(
          rehydrateQuery,
          { ...translatorContext, db: tx },
          true
        );
        const rawRows = await mainQuery;
        const hydrated = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
        return hydrated.length > 0 ? hydrated[0] : null;
      } catch (error: any) {
        if (error instanceof MutationError) throw error;
        throw new MutationError(`Single mutation failed: ${error.message}`, error);
      }
    });
  }

  // STRATEGY B: Universal Fallback (Temporary Table for 100% security)
  return await db.transaction(async (tx: any) => {
    const tempTableName = generateTempTableName();
    const tempTableIdent = sql.identifier(tempTableName);
    
    const dbColumnName = (pkColumn as any).name || pkName;
    const dbColumnIdent = sql.identifier(dbColumnName);

    await tx.execute(sql`CREATE TEMPORARY TABLE ${tempTableIdent} AS SELECT ${pkColumn} FROM ${baseTable} WHERE 1=0`);

    try {
      let whereAst;
      if (isFilterSimple(effectiveFilter, metadata, baseTableName)) {
        whereAst = parseFilter(effectiveFilter, baseTable, new Map(), metadata, baseTableName, tx);
      } else {
        whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);
      }

      const whereClause = whereAst ? sql` WHERE ${whereAst}` : sql``;

      await tx.execute(sql`
        INSERT INTO ${tempTableIdent} (${dbColumnIdent})
        SELECT ${pkColumn} FROM ${baseTable}${whereClause}
      `);

      const captureCount = await getTempTableCount(tx, tempTableIdent);
      if (captureCount === 0) return null; 

      let preHydratedData: any | null = null;
      if (hydrateBefore) {
        const { mainQuery, paths } = await buildSearchQueries(
          { filter: {}, page: 1, pageSize: 1 } as any,
          { ...translatorContext, db: tx },
          true
        );
        const hydrationQuery = mainQuery.innerJoin(tempTableIdent, eq(pkColumn, sql`${tempTableIdent}.${dbColumnIdent}`));
        const rawRows = await hydrationQuery;
        const hydrated = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
        preHydratedData = hydrated.length > 0 ? hydrated[0] : null;
      }

      const subquery = sql`(SELECT ${dbColumnIdent} FROM ${tempTableIdent})`;
      const result = await mutationFn(tx, inArray(pkColumn, subquery as any));

      if (!isMutated(result)) return null;
      if (hydrateBefore) return preHydratedData;

      const { mainQuery, paths } = await buildSearchQueries(
        { 
          filter: rehydrateFilter || {}, 
          page: 1, 
          pageSize: 1 
        } as any,
        { ...translatorContext, db: tx },
        true
      );

      const hydrationQuery = mainQuery.innerJoin(tempTableIdent, eq(pkColumn, sql`${tempTableIdent}.${dbColumnIdent}`));
      const rawRows = await hydrationQuery;
      
      const results = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
      return results.length > 0 ? results[0] : null;
    } catch (error: any) {
      if (error instanceof MutationError) throw error;
      throw new MutationError(`Single mutation failed (fallback): ${error.message}`, error);
    } finally {
      await tx.execute(sql`DROP TEMPORARY TABLE IF EXISTS ${tempTableIdent}`);
    }
  });
}
