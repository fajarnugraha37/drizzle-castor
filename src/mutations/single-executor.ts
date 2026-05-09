import { sql, eq, exists } from "drizzle-orm";
import { generateTempTableName, supportsReturning, getTempTableCount } from "../helper/dialect-helper";
import { buildSearchQueries, hydrateResults, buildExistsCondition } from "../query-parser";
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
        // let whereAst;
        // if (isFilterSimple(effectiveFilter, metadata, baseTableName)) {
        //   whereAst = parseFilter(effectiveFilter, baseTable, new Map(), metadata, baseTableName, tx);
        // } else {
        //   whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);
        // }
        
        // [DECISION]: Always use EXISTS strategy for batch mutations 
        // even if it may be less performant for simple cases.
        // This avoids the risk of limitations with IN (subquery) materialization 
        // and to improve scalability and avoid potential database engine limits
        // since it is hard to reliably determine the number of results beforehand
        const whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);
        
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

        // CLEAN REHYDRATE: Use rehydrateFilter if provided (contains status checks), otherwise just the ID
        const rehydrateQuery: any = { 
          filter: rehydrateFilter || { [pkName]: { $eq: idValue } }, 
          page: 1, 
          pageSize: 1 
        };

        const { mainQuery, paths } = await buildSearchQueries(
          rehydrateQuery,
          { 
            ...translatorContext, 
            db: tx 
          },
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
      // let whereAst;
      // if (isFilterSimple(effectiveFilter, metadata, baseTableName)) {
      //   whereAst = parseFilter(effectiveFilter, baseTable, new Map(), metadata, baseTableName, tx);
      // } else {
      //   whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);
      // }
      // [DECISION]: Always use EXISTS strategy for batch mutations 
      // even if it may be less performant for simple cases.
      // This avoids the risk of limitations with IN (subquery) materialization 
      // and to improve scalability and avoid potential database engine limits
      // since it is hard to reliably determine the number of results beforehand
      const whereAst = await buildExistsCondition(effectiveFilter, { ...translatorContext, db: tx }, baseTable);

      const whereClause = whereAst ? sql` WHERE ${whereAst}` : sql``;

      await tx.execute(sql`
        INSERT INTO ${tempTableIdent} (${dbColumnIdent})
        SELECT ${pkColumn} FROM ${baseTable}${whereClause}
      `);

      const captureCount = await getTempTableCount(tx, tempTableIdent);
      if (captureCount === 0) return null; 

      let preHydratedData: any | null = null;
      if (hydrateBefore) {
        // Use the effective filter (which contains the ID) to find the record before deletion
        const { mainQuery, paths } = await buildSearchQueries(
          { filter: effectiveFilter, page: 1, pageSize: 1 } as any,
          { ...translatorContext, db: tx },
          true
        );
        
        const rawRows = await mainQuery;
        const hydrated = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
        preHydratedData = hydrated.length > 0 ? hydrated[0] : null;
      }

      const existsCondition = exists(
        tx.select({ one: sql`1` })
          .from(tempTableIdent)
          .where(eq(sql`${tempTableIdent}.${dbColumnIdent}`, pkColumn))
      );
      const result = await mutationFn(tx, existsCondition);

      if (!isMutated(result)) return null;
      if (hydrateBefore) return preHydratedData;

      // FIX: Clean up re-hydration query. 
      // Do not use $and if not needed to prevent redundant "id = ? AND id = ?" in SQL.
      // Use rehydrateFilter (usually status-based) or default to the ID.
      const rehydrateQuery: any = { 
        filter: rehydrateFilter || { [pkName]: { $eq: idValue } }, 
        page: 1, 
        pageSize: 1 
      };

      const { mainQuery, paths } = await buildSearchQueries(
        rehydrateQuery,
        { ...translatorContext, db: tx },
        true
      );

      // FIX: Removed outer .where(eq(joinPkColumn, idValue)) call.
      // buildSearchQueries already provides a mainQuery joined with the correctly filtered CTE 'sq'.
      // Adding another WHERE clause results in redundant SQL and potential re-hydration failure in MySQL.
      const rawRows = await mainQuery;
      
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
