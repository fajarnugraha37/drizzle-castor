import { buildSearchQueries, hydrateResults, type TranslatorContext } from "../query-parser";
import type { DbAction } from "../types";

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

  // Use buildSearchQueries with isPaginated=true and pageSize=1
  const q = { ...query, page: 1, pageSize: 1 } as any;
  const { mainQuery } = buildSearchQueries(q, translatorContext, true);

  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata);

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

  const { mainQuery, countQuery } = buildSearchQueries(
    query as any,
    translatorContext,
    true,
  );

  // Execute Count query
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
      meta: {
        currentPage: page,
        pageSize,
        totalPages: 0,
        totalItems: 0,
      },
    };
  }

  // Execute Main Query (which wraps the CTE) & Hydrate
  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata);

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

  const { mainQuery } = buildSearchQueries(
    query as any,
    translatorContext,
    false,
  );

  // Execute Main Query (which wraps the CTE) & Hydrate
  const rawRows = await mainQuery;
  const data = hydrateResults(rawRows, tableName, translatorContext.metadata);

  if (hooks?.afterSearch) {
    await hooks.afterSearch(query, data);
  }

  return data;
}
