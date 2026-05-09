import { sql, eq, inArray } from "drizzle-orm";
import { generateTempTableName, supportsReturning, getTempTableCount } from "../helper/dialect-helper";
import { buildSearchQueries, hydrateResults, parseFilter, isFilterSimple, buildExistsCondition } from "../query-parser";
import { MutationError } from "../errors";
import type { MiddlewareContext } from "../middleware/index";

/**
 * Helper to check if a mutation result indicates success.
 */
function isMutated(result: any[] | number): boolean {
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === "number") return result > 0;
  return !!result;
}

/**
 * Executes a batch mutation (Many) with race-condition protection.
 * Strategy A: Uses .returning() inside a transaction for efficiency and atomicity.
 * Strategy B (Fallback): Uses Temporary Tables to capture IDs before operation.
 * 
 * @param hydrateBefore If true, hydrates records BEFORE mutation (required for Hard Delete).
 */
export async function executeBatchMutation(
  ctx: MiddlewareContext,
  baseTable: any,
  pkName: string,
  mutationFn: (tx: any, whereClause: any) => Promise<any[] | number>,
  searchFilter: any,
  rehydrateFilter?: any,
  hydrateBefore: boolean = false
): Promise<any[]> {
  const { translatorContext } = ctx;
  const { db, metadata, baseTableName } = translatorContext;
  const pkColumn = baseTable[pkName];

  // STRATEGY A: PostgreSQL / SQLite (Efficient .returning() + Transaction for BUG-3)
  if (supportsReturning(db)) {
    return await db.transaction(async (tx: any) => {
      try {
        let whereAst;
        if (isFilterSimple(searchFilter, metadata, baseTableName)) {
          whereAst = parseFilter(searchFilter, baseTable, new Map(), metadata, baseTableName, tx);
        } else {
          whereAst = await buildExistsCondition(searchFilter, { ...translatorContext, db: tx }, baseTable);
        }
        
        let preHydratedData: any[] = [];
        if (hydrateBefore) {
          const { mainQuery, paths } = await buildSearchQueries(
            { filter: searchFilter, projection: ctx.params.query?.projection } as any,
            { ...translatorContext, db: tx },
            false
          );
          const rawRows = await mainQuery;
          preHydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
          if (preHydratedData.length === 0) return [];
        }

        const result = await mutationFn(tx, whereAst);
        
        if (!isMutated(result)) return [];
        if (hydrateBefore) return preHydratedData;

        const affectedFilter = Array.isArray(result) ? { [pkName]: { $inArray: result } } : searchFilter;
        const rehydrateQuery: any = { 
          filter: { 
            $and: [affectedFilter, rehydrateFilter].filter(Boolean)
          } 
        };

        const { mainQuery, paths } = await buildSearchQueries(
          rehydrateQuery,
          { ...translatorContext, db: tx },
          false
        );
        const rawRows = await mainQuery;
        return hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
      } catch (error: any) {
        if (error instanceof MutationError) throw error;
        throw new MutationError(`Batch mutation failed: ${error.message}`, error);
      }
    });
  }

  // STRATEGY B: Universal Fallback (Temporary Table for scale and atomicity)
  return await db.transaction(async (tx: any) => {
    const tempTableName = generateTempTableName();
    const tempTableIdent = sql.identifier(tempTableName);
    
    const dbColumnName = (pkColumn as any).name || pkName;
    const dbColumnIdent = sql.identifier(dbColumnName);

    await tx.execute(sql`CREATE TEMPORARY TABLE ${tempTableIdent} AS SELECT ${pkColumn} FROM ${baseTable} WHERE 1=0`);

    try {
      let whereAst;
      if (isFilterSimple(searchFilter, metadata, baseTableName)) {
        whereAst = parseFilter(searchFilter, baseTable, new Map(), metadata, baseTableName, tx);
      } else {
        whereAst = await buildExistsCondition(searchFilter, { ...translatorContext, db: tx }, baseTable);
      }
      
      await tx.execute(sql`
        INSERT INTO ${tempTableIdent} (${dbColumnIdent})
        SELECT ${pkColumn} FROM ${baseTable} WHERE ${whereAst}
      `);

      const captureCount = await getTempTableCount(tx, tempTableIdent);
      if (captureCount === 0) return []; 

      let preHydratedData: any[] = [];
      if (hydrateBefore) {
        const { mainQuery, paths } = await buildSearchQueries(
          { filter: {}, projection: ctx.params.query?.projection } as any,
          { ...translatorContext, db: tx },
          false
        );
        const hydrationQuery = mainQuery.innerJoin(tempTableIdent, eq(pkColumn, sql`${tempTableIdent}.${dbColumnIdent}`));
        const rawRows = await hydrationQuery;
        preHydratedData = hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
      }

      const subquery = sql`(SELECT ${dbColumnIdent} FROM ${tempTableIdent})`;
      const result = await mutationFn(tx, inArray(pkColumn, subquery as any));

      if (!isMutated(result)) {
        return [];
      }

      if (hydrateBefore) return preHydratedData;

      // 4. Hydrate joining Temp Table
      const { mainQuery, paths } = await buildSearchQueries(
        { 
          filter: rehydrateFilter || {}, 
          projection: ctx.params.query?.projection 
        } as any,
        { ...translatorContext, db: tx },
        false
      );

      const hydrationQuery = mainQuery.innerJoin(tempTableIdent, eq(pkColumn, sql`${tempTableIdent}.${dbColumnIdent}`));
      const rawRows = await hydrationQuery;
      
      return hydrateResults(rawRows, baseTableName, metadata, pkName, paths);
    } catch (error: any) {
      if (error instanceof MutationError) throw error;
      throw new MutationError(`Batch mutation failed (fallback): ${error.message}`, error);
    } finally {
      // FIX HIGH: Ensure temporary table is dropped to prevent connection pool leaks
      await tx.execute(sql`DROP TEMPORARY TABLE IF EXISTS ${tempTableIdent}`);
    }
  });
}
