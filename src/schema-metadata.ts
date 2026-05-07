import { buildSearchQueries, hydrateResults } from "./query-parser";

export function defineSchemaMetadata<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables) {
  type _TTStrictSchemaMetadata = TStrictSchemaMetadata<
    TDb,
    TTables
  >["metadata"];
  return function <const TMetadata extends _TTStrictSchemaMetadata>(
    metadata: TMetadata,
  ) {
    type _TSchemaContext = TSchemaContext<TDb, TTables, TMetadata>;
    type _TTableNames = keyof TMetadata & string;
    type _TProfileNames<TName extends _TTableNames> =
      TMetadata[TName] extends TableConfig<_TSchemaContext, TName>
        ? keyof TMetadata[TName]["profiles"] & string
        : "never";
    type _RepoProfileConfig<TName extends _TTableNames> = RepoProfileConfig<
      _TSchemaContext,
      TName
    >;
    type _TProfiles<TName extends _TTableNames> = Partial<
      {
        [K in _TProfileNames<TName>]?: _RepoProfileConfig<TName>;
      } & {
        [key: string]: _RepoProfileConfig<TName>;
      }
    >;

    const repoFactory = <
      TName extends _TTableNames,
      TProfiles extends _TProfiles<TName>,
    >(
      tableName: TName,
      options: TProfiles,
    ): Repository<_TSchemaContext, TName, TProfiles> => {
      
      const translatorContext = {
        db,
        tables,
        metadata,
        baseTableName: tableName,
      };

      return {
        createOne: async (data, profile) => {
          console.log(`Executing createOne on ${tableName} with data:`, data);
          throw new Error("Not implemented");
        },
        createMany: async (data, profile) => {
          console.log(`Executing createMany on ${tableName} with data:`, data);
          throw new Error("Not implemented");
        },
        searchOne: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;

          if (hooks?.beforeSearch) {
             await hooks.beforeSearch(query);
          }

          // Use buildSearchQueries with isPaginated=true and pageSize=1
          const q = { ...query, page: 1, pageSize: 1 } as any;
          const { mainQuery } = buildSearchQueries(q, translatorContext, true);
          
          const rawRows = await mainQuery;
          const data = hydrateResults(rawRows, tableName, metadata);

          if (hooks?.afterSearch) {
             await hooks.afterSearch(query, data);
          }

          return data.length > 0 ? data[0] : null;
        },
        searchPage: async (query, profile) => {
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 10;
          
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;

          if (hooks?.beforeSearch) {
             await hooks.beforeSearch(query);
          }

          const { mainQuery, countQuery } = buildSearchQueries(query as any, translatorContext, true);
          
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
              meta: { currentPage: page, pageSize, totalPages: 0, totalItems: 0 } 
            } as any;
          }

          // Execute Main Query (which wraps the CTE) & Hydrate
          const rawRows = await mainQuery;
          const data = hydrateResults(rawRows, tableName, metadata);

          if (hooks?.afterSearch) {
             await hooks.afterSearch(query, data);
          }

          return { 
            data, 
            meta: { currentPage: page, pageSize, totalPages, totalItems } 
          } as any;
        },
        searchMany: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;

          if (hooks?.beforeSearch) {
             await hooks.beforeSearch(query);
          }

          const { mainQuery } = buildSearchQueries(query as any, translatorContext, false);
          
          // Execute Main Query (which wraps the CTE) & Hydrate
          const rawRows = await mainQuery;
          const data = hydrateResults(rawRows, tableName, metadata);

          if (hooks?.afterSearch) {
             await hooks.afterSearch(query, data);
          }

          return data;
        },
        searchDeletedOne: async (query, profile) => {
          console.log(
            `Executing searchDeletedOne on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        searchDeletedPage: async (query, profile) => {
          console.log(
            `Executing searchDeletedPage on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        searchDeletedMany: async (query, profile) => {
          console.log(
            `Executing searchDeletedMany on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        updateOne: async (id, set, profile) => {
          console.log(
            `Executing updateOne on ${tableName} with id: ${id} and set:`,
            set,
          );
          throw new Error("Not implemented");
        },
        updateMany: async (filter, set, profile) => {
          console.log(
            `Executing updateMany on ${tableName} with filter:`,
            filter,
            "and set:",
            set,
          );
          throw new Error("Not implemented");
        },
        softDeleteOne: async (id, profile) => {
          console.log(`Executing softDeleteOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        softDeleteMany: async (filter, profile) => {
          console.log(
            `Executing softDeleteMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
        },
        restoreOne: async (id, profile) => {
          console.log(`Executing restoreOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        restoreMany: async (filter, profile) => {
          console.log(
            `Executing restoreMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
        },
        hardDeleteOne: async (id, profile) => {
          console.log(`Executing hardDeleteOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        hardDeleteMany: async (filter, profile) => {
          console.log(
            `Executing hardDeleteMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
        },
      };
    };

    return {
      db,
      tables,
      metadata,
      repoFactory,
    };
  };
}
