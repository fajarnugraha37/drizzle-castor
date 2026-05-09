import { sql, getTableName, exists, aliasedTable, and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { analyzeQuery } from "./analyzer";
import { buildAliases } from "./alias-manager";
import { applyJoins, parseFilter, parseOrder, buildSelection } from "./ast-compiler";
import { getPrimaryKeyColumnName, resolveProviderValues } from "../helper";
import type { SearchQuery, TranslatorContext } from "../types";
import { TableNotFoundError } from "../errors";


/**
 * Checks if a filter only touches the base table (no relations).
 * A filter is considered complex if it contains dots (relations or JSON paths).
 */
export function isFilterSimple(filter: any, metadata: any, baseTableName: string): boolean {
  if (!filter || typeof filter !== "object") 
    return true;

  for (const key of Object.keys(filter)) {
    if (key === "$and" || key === "$or" || key === "$not") {
      const children = Array.isArray(filter[key]) ? filter[key] : [filter[key]];
      if (children.some((c: any) => !isFilterSimple(c, metadata, baseTableName))) {
        return false;
      }
    } else if (!key.startsWith("$")) {
      // FIX MEDIUM: If key contains a dot, it touches a relation or JSON column,
      // making it complex and requiring EXISTS/JOIN strategy.
      if (key.includes(".")) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Builds a correlated EXISTS condition for complex batch mutations.
 * Bypasses IN (subquery) materialization issues.
 */
export async function buildExistsCondition(
  filter: any,
  context: TranslatorContext,
  baseTable: any,
): Promise<SQL> {
  const { db, tables, metadata, baseTableName } = context;
  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = (baseTable as any)[pkName];

  const subTableAliasName = `sub_${baseTableName}_correlate`;
  const subTable = aliasedTable(baseTable, subTableAliasName);
  const paths = analyzeQuery({ filter }, metadata, baseTableName);
  
  // Create unique aliases for subquery relations using "sub" prefix
  const subAliasMap = buildAliases(
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    "sub"
  );
  
  // Pre-resolve soft delete conditions
  const resolvedSoftDelete: Record<string, { restore?: any, delete?: any }> = {};
  for (const table of tables) {
    const tName = getTableName(table);
    const sdConfig = metadata[tName]?.softDelete;
    if (sdConfig) {
      resolvedSoftDelete[tName] = {
        restore: sdConfig.restoreValue ? await resolveProviderValues(sdConfig.restoreValue) : undefined,
        delete: sdConfig.deleteValue ? await resolveProviderValues(sdConfig.deleteValue) : undefined,
      };
    }
  }

  let subquery = db.select({ 1: sql`1` }).from(subTable);
  subquery = applyJoins(
    subquery,
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    subTable,
    subAliasMap,
    resolvedSoftDelete
  );
  
  const filterAst = parseFilter(filter, subTable, subAliasMap, metadata, baseTableName, db);
  const correlation = eq((subTable as any)[pkName], pkColumn);

  if (filterAst) {
    subquery = subquery.where(and(correlation, filterAst));
  } else {
    subquery = subquery.where(correlation);
  }

  return exists(subquery);
}

/**
 * Translates a SearchQuery into a Drizzle AST execution plan (Split Queries strategy).
 * Returns the two queries: the CTE (for pagination/filtering) and the Outer query (for hydration).
 */
export async function buildSearchQueries<T>(
  query: SearchQuery<T>,
  context: TranslatorContext,
  isPaginated: boolean = false
) {
  const { db, tables, metadata, baseTableName } = context;

  console.log("buildSearchQueries called with baseTableName:", baseTableName);
  const baseTable = tables.find((t) => {
    console.log("Checking table:", getTableName(t));
    return getTableName(t) === baseTableName;
  });
  console.log("Found baseTable:", !!baseTable);
  
  if (!baseTable) {
    throw new TableNotFoundError(`Base table '${baseTableName}' not found.`);
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

  const pkName = getPrimaryKeyColumnName(baseTable);
  const pkColumn = (baseTable as any)[pkName];

  // Pre-resolve soft delete conditions for all tables to avoid returning a Promise of a QueryBuilder
  const resolvedSoftDelete: Record<string, { restore?: any, delete?: any }> = {};
  for (const table of tables) {
    const tName = getTableName(table);
    const sdConfig = metadata[tName]?.softDelete;
    if (sdConfig) {
      resolvedSoftDelete[tName] = {
        restore: sdConfig.restoreValue ? await resolveProviderValues(sdConfig.restoreValue) : undefined,
        delete: sdConfig.deleteValue ? await resolveProviderValues(sdConfig.deleteValue) : undefined,
      };
    }
  }

  // 3. Build CTE Query Builder
  let cteQb = db.select({ [pkName]: pkColumn }).from(baseTable);
  cteQb = applyJoins(
    cteQb,
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    cteAliasMap,
    resolvedSoftDelete,
  );

  const filterAst = parseFilter(query.filter, baseTable, cteAliasMap, metadata, baseTableName, db);
  if (filterAst) {
    cteQb = cteQb.where(filterAst);
  }

  if (paths.needsGroupBy) {
    cteQb = cteQb.groupBy(pkColumn);
  } else {
    // Distinct is generally handled by GROUP BY when relations are involved,
    // but if no array relations are used in order, we can use distinct to prevent fan-out
    // Note: Some dialects have .distinct() builder method, otherwise group by PK is safer.
    cteQb = cteQb.groupBy(pkColumn);
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
  let countQb = db.select({ count: sql`count(distinct ${pkColumn})` }).from(baseTable);
  countQb = applyJoins(
    countQb,
    paths.ctePaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    cteAliasMap,
    resolvedSoftDelete,
  );
  if (filterAst) {
    countQb = countQb.where(filterAst);
  }

  // 5. Build True CTE and Main Query
  const sq = db.$with('sq').as(cteQb);
  
  const selectionObj = buildSelection(query.projection as string[], baseTableName, baseTable, outerAliasMap, metadata, db);
  let mainQb = selectionObj 
    ? db.with(sq).select(selectionObj).from(baseTable).innerJoin(sq, sql`${pkColumn} = ${sq}.${sql.identifier(pkName)}`)
    : db.with(sq).select().from(baseTable).innerJoin(sq, sql`${pkColumn} = ${sq}.${sql.identifier(pkName)}`);

  mainQb = applyJoins(
    mainQb,
    paths.outerPaths,
    tables,
    metadata,
    baseTableName,
    baseTable,
    outerAliasMap,
    resolvedSoftDelete,
  );

  return {
    cteQuery: cteQb,
    mainQuery: mainQb,
    countQuery: countQb,
    paths: Array.from(paths.outerPaths),
  };
}
