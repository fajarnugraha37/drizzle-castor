export * from "./metadata-explorer";
export * from "./analyzer";
export * from "./operator-builder";
export * from "./alias-manager";
export * from "./ast-compiler";
export * from "./hydrator";

import { sql, getTableName } from "drizzle-orm";
import { analyzeQuery } from "./analyzer";
import { buildAliases } from "./alias-manager";
import { applyJoins, parseFilter, parseOrder, buildSelection } from "./ast-compiler";
import type { AnyTable, SearchQuery } from "../types";

export type TranslatorContext = {
  db: any;
  tables: readonly AnyTable[];
  metadata: any;
  baseTableName: string;
};

/**
 * Translates a SearchQuery into a Drizzle AST execution plan (Split Queries strategy).
 * Returns the two queries: the CTE (for pagination/filtering) and the Outer query (for hydration).
 */
export function buildSearchQueries<T>(
  query: SearchQuery<T>,
  context: TranslatorContext,
  isPaginated: boolean = false
) {
  const { db, tables, metadata, baseTableName } = context;

  const baseTable = tables.find((t) => getTableName(t) === baseTableName);
  if (!baseTable) {
    throw new Error(`Base table '${baseTableName}' not found.`);
  }

  // 1. Analyze paths
  const paths = analyzeQuery(query, metadata, baseTableName);

  // 2. Build Aliases for CTE and Outer
  const cteAliasMap = buildAliases(
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
  );
  const outerAliasMap = buildAliases(
    paths.outerPaths,
    tables,
    metadata,
    baseTableName,
  );

  // 3. Build CTE Query Builder
  let cteQb = db.select({ id: (baseTable as any).id }).from(baseTable);
  cteQb = applyJoins(
    cteQb,
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    cteAliasMap,
  );

  const filterAst = parseFilter(query.filter, baseTable, cteAliasMap, metadata, baseTableName, db);
  if (filterAst) {
    cteQb = cteQb.where(filterAst);
  }

  if (paths.needsGroupBy) {
    cteQb = cteQb.groupBy((baseTable as any).id);
  } else {
    // Distinct is generally handled by GROUP BY when relations are involved,
    // but if no array relations are used in order, we can use distinct to prevent fan-out
    // Note: Some dialects have .distinct() builder method, otherwise group by PK is safer.
    cteQb = cteQb.groupBy((baseTable as any).id);
  }

  const orderAst = parseOrder(query.order, baseTable, cteAliasMap, metadata, baseTableName, db);
  if (orderAst.length > 0) {
    cteQb = cteQb.orderBy(...orderAst);
  }

  if (isPaginated) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    cteQb = cteQb.limit(limit).offset(offset);
  }

  // 4. Build Count Query (for pagination)
  let countQb = db.select({ count: sql`count(distinct ${(baseTable as any).id})` }).from(baseTable);
  countQb = applyJoins(
    countQb,
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    cteAliasMap,
  );
  if (filterAst) {
    countQb = countQb.where(filterAst);
  }

  // 5. Build True CTE and Main Query
  const sq = db.$with('sq').as(cteQb);
  
  const selectionObj = buildSelection(query.projection as string[], baseTableName, baseTable, outerAliasMap, metadata, db);
  let mainQb = selectionObj 
    ? db.with(sq).select(selectionObj).from(baseTable).innerJoin(sq, sql`${(baseTable as any).id} = ${sq}.id`)
    : db.with(sq).select().from(baseTable).innerJoin(sq, sql`${(baseTable as any).id} = ${sq}.id`);

  mainQb = applyJoins(
    mainQb,
    paths.outerPaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    outerAliasMap,
  );

  return {
    mainQuery: mainQb,
    countQuery: countQb,
  };
}