import { buildSearchQueries, hydrateResults, type TranslatorContext } from "../query-parser";
import type { DbAction, SoftDeleteConfig } from "../types";
import { getTableColumns } from "drizzle-orm";

/**
 * Resolves static values, synchronous functions, or asynchronous promises
 */
async function resolveProviderValues(configObj: any): Promise<Record<string, any>> {
  if (!configObj) return {};
  const resolved: Record<string, any> = {};
  for (const [key, provider] of Object.entries(configObj)) {
    if (typeof provider === "function") {
      resolved[key] = await provider();
    } else {
      resolved[key] = provider;
    }
  }
  return resolved;
}

/**
 * Injects soft delete filters into the user query.
 * mode="active": Only show records where restoreValue matches (or deleteValue is null/ne).
 * mode="deleted": Only show records where deleteValue matches (or restoreValue is ne).
 */
async function injectSoftDeleteFilter(query: any, metadata: any, tableName: string, mode: "active" | "deleted") {
  const config = metadata[tableName]?.softDelete as SoftDeleteConfig<any>;
  if (!config) return query; // If no soft delete config, do nothing

  const softFilter: Record<string, any> = {};
  
  if (mode === "active") {
    if (config.restoreValue) {
      const resolvedRestore = await resolveProviderValues(config.restoreValue);
      for (const [key, val] of Object.entries(resolvedRestore)) {
        softFilter[key] = val === null ? { $isNull: true } : { $eq: val };
      }
    } else if (config.deleteValue) {
      const resolvedDelete = await resolveProviderValues(config.deleteValue);
      for (const [key, val] of Object.entries(resolvedDelete)) {
        // If delete value is dynamic (like Date.now), active is usually when it's null
        softFilter[key] = (typeof config.deleteValue[key] === "function") 
          ? { $isNull: true } 
          : { $ne: val };
      }
    }
  } else if (mode === "deleted") {
    if (config.deleteValue) {
      const resolvedDelete = await resolveProviderValues(config.deleteValue);
      for (const [key, val] of Object.entries(resolvedDelete)) {
        softFilter[key] = (typeof config.deleteValue[key] === "function") 
          ? { $notIsNull: true } 
          : { $eq: val };
      }
    } else if (config.restoreValue) {
      const resolvedRestore = await resolveProviderValues(config.restoreValue);
      for (const [key, val] of Object.entries(resolvedRestore)) {
        softFilter[key] = val === null ? { $notIsNull: true } : { $ne: val };
      }
    }
  }

  // Merge the soft filter with the user's existing filter using an $and conjunction
  if (Object.keys(softFilter).length > 0) {
    if (!query.filter) {
      query.filter = softFilter;
    } else {
      query.filter = {
        $and: [query.filter, softFilter]
      };
    }
  }

  return query;
}

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
