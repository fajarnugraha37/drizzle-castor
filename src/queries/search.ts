import { buildSearchQueries, hydrateResults, injectSoftDeleteFilter } from "../query-parser";
import { getTableColumns } from "drizzle-orm";
import type { MiddlewareContext } from "../middleware/index";

export async function executeSearchOne(
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter({ ...params.query, page: 1, pageSize: 1 }, translatorContext.metadata, ctx.tableName, "active");
  const { mainQuery, paths } = await buildSearchQueries(q as any, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);

  return data.length > 0 ? data[0] : null;
}

export async function executeSearchPage(
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const page = params.query?.page ?? 1;
  const pageSize = params.query?.pageSize ?? 10;

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "active");

  const { mainQuery, countQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    true,
  );

  const countResult = await countQuery;
  const totalItems = Number(countResult[0]?.count || 0);
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
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "active");

  const { mainQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    false,
  );

  const rawRows = await mainQuery;
  return hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);
}

export async function executeSearchDeletedOne(
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter({ ...params.query, page: 1, pageSize: 1 }, translatorContext.metadata, ctx.tableName, "deleted");
  const { mainQuery, paths } = await buildSearchQueries(q as any, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);

  return data.length > 0 ? data[0] : null;
}

export async function executeSearchDeletedPage(
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const page = params.query?.page ?? 1;
  const pageSize = params.query?.pageSize ?? 10;

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "deleted");

  const { mainQuery, countQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    true,
  );

  const countResult = await countQuery;
  const totalItems = Number(countResult[0]?.count || 0);
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

export async function executeSearchDeletedMany(
  ctx: MiddlewareContext
) {
  const { params, translatorContext } = ctx;
  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(params.query, translatorContext.metadata, ctx.tableName, "deleted");

  const { mainQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    false,
  );

  const rawRows = await mainQuery;
  return hydrateResults(rawRows, ctx.tableName, translatorContext.metadata, pkName, paths);
}
