import { buildSearchQueries, hydrateResults } from "../query-parser";
import { injectSoftDeleteFilter, getPrimaryKeyColumnName, findBaseTable } from "../helper";
import type { ExecutionContext } from "../types/context";

export async function executeSearchOne(
  ctx: ExecutionContext<any, any>
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  
  // FIX: Centralized table and PK resolution
  const baseTable = findBaseTable(tables, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);

  const q = await injectSoftDeleteFilter({ ...params.query, page: 1, pageSize: 1 }, translatorContext.metadata, ctx.tableName, "active");
  const { mainQuery, paths } = await buildSearchQueries(q as any, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);

  return data.length > 0 ? data[0] : null;
}

export async function executeSearchPage(
  ctx: ExecutionContext<any, any>
) {
  const { params, translatorContext } = ctx;
  const page = params.query?.page ?? 1;
  const pageSize = params.query?.pageSize ?? 10;

  const { tables, baseTableName } = translatorContext;
  
  // FIX: Centralized table and PK resolution
  const baseTable = findBaseTable(tables, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "active");

  const { mainQuery, countQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    true,
  );

  const countResult = await countQuery;
  
  // FIX: Robust count extraction handling potential bigint/string variations
  const totalItemsRaw = countResult[0]?.count ?? countResult[0]?.["count"] ?? 0;
  const totalItems = typeof totalItemsRaw === "bigint" ? Number(totalItemsRaw) : parseInt(String(totalItemsRaw), 10) || 0;
  
  const totalPages = Math.ceil(totalItems / pageSize);

  if (totalItems === 0) {
    return {
      data: [],
      meta: { currentPage: page, pageSize, totalPages: 0, totalItems: 0 },
    };
  }

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);

  return {
    data,
    meta: { currentPage: page, pageSize, totalPages, totalItems },
  };
}

export async function executeSearchMany(
  ctx: ExecutionContext<any, any>
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  
  // FIX: Centralized table and PK resolution
  const baseTable = findBaseTable(tables, baseTableName);
  const pkName = getPrimaryKeyColumnName(baseTable);

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "active");

  const { mainQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    false,
  );

  const rawRows = await mainQuery;
  return hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);
}
