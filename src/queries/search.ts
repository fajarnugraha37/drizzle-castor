import { buildSearchQueries, hydrateResults, type TranslatorContext, injectSoftDeleteFilter } from "../query-parser";
import type { DbAction } from "../types";
import { getTableColumns } from "drizzle-orm";

export async function executeSearchOne(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);

  if (hooks?.beforeSearch) {
    await hooks.beforeSearch(query);
  }

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter({ ...query, page: 1, pageSize: 1 }, translatorContext.metadata, tableName, "active");
  const { mainQuery, paths } = await buildSearchQueries(q as any, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);

  if (hooks?.afterSearch) {
    await hooks.afterSearch(query, data);
  }

  return data.length > 0 ? data[0] : null;
}

export async function executeSearchPage(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;

  if (hooks?.beforeSearch) {
    await hooks.beforeSearch(query);
  }

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(query, translatorContext.metadata, tableName, "active");

  const { mainQuery, countQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    true,
  );

  const countResult = await countQuery;
  const totalItems = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalItems / pageSize);

  if (totalItems === 0) {
    const emptyResult: any[] = [];
    if (hooks?.afterSearch) {
      await hooks.afterSearch(query, emptyResult);
    }
    return {
      data: emptyResult,
      meta: { currentPage: page, pageSize, totalPages: 0, totalItems: 0 },
    };
  }

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);

  if (hooks?.afterSearch) {
    await hooks.afterSearch(query, data);
  }

  return {
    data,
    meta: { currentPage: page, pageSize, totalPages, totalItems },
  };
}

export async function executeSearchMany(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);

  if (hooks?.beforeSearch) {
    await hooks.beforeSearch(query);
  }

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(query, translatorContext.metadata, tableName, "active");

  const { mainQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    false,
  );

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);

  if (hooks?.afterSearch) {
    await hooks.afterSearch(query, data);
  }

  return data;
}

export async function executeSearchDeletedOne(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter({ ...query, page: 1, pageSize: 1 }, translatorContext.metadata, tableName, "deleted");
  const { mainQuery, paths } = await buildSearchQueries(q as any, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);

  return data.length > 0 ? data[0] : null;
}

export async function executeSearchDeletedPage(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(query, translatorContext.metadata, tableName, "deleted");

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
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);

  return {
    data,
    meta: { currentPage: page, pageSize, totalPages, totalItems },
  };
}

export async function executeSearchDeletedMany(
  query: any,
  checkAccess: (action: DbAction, profile?: string | string[]) => void,
  profile: string | string[] | undefined,
  hooks: any,
  translatorContext: TranslatorContext,
  tableName: string,
) {
  checkAccess("read", profile);

  const { tables, baseTableName } = translatorContext;
  const baseTable = tables.find((t: any) => t[Symbol.for("drizzle:Name")] === baseTableName || t.name === baseTableName || (t as any)[Symbol.for("drizzle:Table")]?.name === baseTableName) || tables[0];
  const pkName = (Object.keys(getTableColumns(baseTable!)).find(k => (baseTable as any)[k].primary) || "id") as string;

  const q = await injectSoftDeleteFilter(query, translatorContext.metadata, tableName, "deleted");

  const { mainQuery, paths } = await buildSearchQueries(
    q as any,
    translatorContext,
    false,
  );

  const rawRows = await mainQuery;
  return hydrateResults(rawRows, tableName, translatorContext.metadata, pkName, paths);
}
