export {};

declare global {
  type BaseSchema = {
    db: any; // <-- Tambahkan ini
    tables: readonly any[];
    metadata: any;
  };

  // The Generic Query Types
  type DbSearchQuery<
    TSchema extends BaseSchema,
    TTableName extends keyof TSchema["metadata"] & string,
  > = SearchQuery<InferEntity<TSchema, TTableName>>;

  type DbUpdateQuery<
    TSchema extends BaseSchema,
    TTableName extends keyof TSchema["metadata"] & string,
  > = UpdateQuery<
    InferModel<FindTable<TSchema["tables"], TTableName>>, // Set data
    InferEntity<TSchema, TTableName> // Filter
  >;

  type DbDeleteQuery<
    TSchema extends BaseSchema,
    TTableName extends keyof TSchema["metadata"] & string,
  > = DeleteQuery<InferEntity<TSchema, TTableName>>;

  //
  //
  //

  // Ekstrak tipe data INSERT (tanpa relasi, murni kolom database)
  type InferInsert<TTable> = TTable extends { $inferInsert: infer U }
    ? U
    : never;

  // Literal Actions untuk Permission Profiles
  type DbAction =
    | "create"
    | "read"
    | "update"
    | "softDelete"
    | "restore"
    | "hardDelete";

  // Tipe Soft Delete Provider (Mendukung static, function sync, maupun async)
  type ValueProvider<T> = T | (() => T) | (() => Promise<T>);

  type SoftDeleteConfig<TBaseTable> = {
    deleteValue: Partial<{
      [K in keyof TBaseTable]: ValueProvider<TBaseTable[K]>;
    }>;
    restoreValue: Partial<{
      [K in keyof TBaseTable]: ValueProvider<TBaseTable[K]>;
    }>;
  };

  // --- HOOKS CONFIGURATION ---
  type TableHooks<
    TSchema extends {
      db: AnyDatabase;
      tables: readonly AnyTable[];
      metadata: any;
    },
    TTableName extends string,
    TEntity = InferEntity<TSchema, TTableName>,
    TInsert = InferInsert<FindTable<TSchema["tables"], TTableName>>,
  > = {
    beforeSearch?: (
      query: DbSearchQuery<TSchema, TTableName>,
    ) => Promise<void> | void;
    afterSearch?: (
      query: DbSearchQuery<TSchema, TTableName>,
      result: TEntity[],
    ) => Promise<void> | void;
    beforeCreate?: (data: TInsert | TInsert[]) => Promise<void> | void;
    afterCreate?: (data: TEntity | TEntity[]) => Promise<void> | void;
    beforeUpdate?: (
      set: Partial<TInsert>,
      affected: FilterQuery<TEntity>,
    ) => Promise<void> | void;
    afterUpdate?: (
      set: Partial<TInsert>,
      affected: TEntity[],
    ) => Promise<void> | void;
    beforeSoftDelete?: (filter: FilterQuery<TEntity>) => Promise<void> | void;
    afterSoftDelete?: (affected: TEntity[]) => Promise<void> | void;
    beforeHardDelete?: (filter: FilterQuery<TEntity>) => Promise<void> | void;
    afterHardDelete?: (affected: TEntity[]) => Promise<void> | void;
  };

  type TableConfig<
    TSchema extends {
      db: AnyDatabase;
      tables: readonly AnyTable[];
      metadata: any;
    },
    TTableName extends string,
  > = {
    hooks?: TableHooks<TSchema, TTableName>;
    softDelete?: SoftDeleteConfig<
      InferModel<FindTable<TSchema["tables"], TTableName>>
    >;
    profiles?: Record<string, readonly DbAction[]>;
  };

  // --- REPOSITORY PROFILES CONFIGURATION ---
  type RepoProfileConfig<
    TSchema extends {
      db: AnyDatabase;
      tables: readonly AnyTable[];
      metadata: any;
    },
    TTableName extends string,
    TEntityPaths = FlattenPaths<InferEntity<TSchema, TTableName>> | "*",
    TInsertKeys =
      | (keyof InferInsert<FindTable<TSchema["tables"], TTableName>> & string)
      | "*",
  > = {
    allowedSets?: readonly TInsertKeys[];
    allowedProjections?: readonly TEntityPaths[];
    allowedFilters?: readonly TEntityPaths[];
    allowedSorts?: readonly TEntityPaths[];
  };

  type DbQueryResult<
    TEntity,
    Q extends { projection?: any },
  > = Q["projection"] extends Array<string>
    ? DeepPick<TEntity, Q["projection"][number]>
    : TEntity;

  type Repository<
    TSchema extends {
      db: AnyDatabase;
      tables: readonly AnyTable[];
      metadata: any;
    },
    TTableName extends string,
    TProfiles extends Record<string, any>,
    TProfileNames = keyof TProfiles | (string & {}),
    TEntity = InferEntity<TSchema, TTableName>,
    TInsert = InferInsert<FindTable<TSchema["tables"], TTableName>>,
  > = {
    // P default ke 'default' (atau fallback ke string biasa jika profil tidak terdefinisi)
    createOne: (data: TInsert, profile?: TProfileNames | TProfileNames[]) => Promise<TEntity>;
    createMany: (
      data: TInsert[],
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<TEntity[]>;

    searchOne: <Q extends Pick<SearchQuery<TEntity>, "projection" | "filter">>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<DbQueryResult<TEntity, Q> | null>;
    searchPage: <Q extends SearchQuery<TEntity>>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<{
      data: DbQueryResult<TEntity, Q>[];
      meta: {
        currentPage: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
      };
    }>;
    searchMany: <Q extends Omit<SearchQuery<TEntity>, "page" | "pageSize">>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<DbQueryResult<TEntity, Q>[]>;

    searchDeletedOne: <Q extends Pick<SearchQuery<TEntity>, "projection" | "filter">>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<DbQueryResult<TEntity, Q> | null>;
    searchDeletedPage: <Q extends SearchQuery<TEntity>>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<{
      data: DbQueryResult<TEntity, Q>[];
      meta: {
        currentPage: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
      };
    }>;
    searchDeletedMany: <Q extends Omit<SearchQuery<TEntity>, "page" | "pageSize">>(
      query: Q,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<DbQueryResult<TEntity, Q>[]>;

    updateOne: (
      id: string | number,
      set: Partial<TInsert>,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<TEntity | null>;
    updateMany: (
      filter: FilterQuery<TEntity>,
      set: Partial<TInsert>,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<TEntity[]>;

    softDeleteOne: (
      id: string | number,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<boolean>;
    softDeleteMany: (
      filter: FilterQuery<TEntity>,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<number>;

    restoreOne: (
      id: string | number,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<boolean>;
    restoreMany: (
      filter: FilterQuery<TEntity>,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<number>;

    hardDeleteOne: (
      id: string | number,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<boolean>;
    hardDeleteMany: (
      filter: FilterQuery<TEntity>,
      profile?: TProfileNames | TProfileNames[],
    ) => Promise<number>;
  };
}
