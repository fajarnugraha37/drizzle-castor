export function defineSchemaMetadata<
  const TDb extends AnyDatabase,
  const TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables) {
  type _TTStrictSchemaMetadata = TStrictSchemaMetadata<
    TDb,
    TTables
  >["metadata"];
  return function <const TMetadata extends _TTStrictSchemaMetadata>(
    metadata: TMetadata,
  ) {
    type _TSchemaContext = TSchemaContext<TDb, TTables>;
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
      const TName extends _TTableNames,
      const TProfiles extends _TProfiles<TName>,
    >(
      tableName: TName,
      options: TProfiles,
    ): Repository<_TSchemaContext, TName, TProfiles> => {
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
          console.log(`Executing searchOne on ${tableName} with query:`, query);
          throw new Error("Not implemented");
        },
        searchPage: async (query, profile) => {
          console.log(
            `Executing searchPage on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        searchMany: async (query, profile) => {
          console.log(
            `Executing searchMany on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
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
