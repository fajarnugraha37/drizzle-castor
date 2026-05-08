import type { InferEntity, FindTable } from "./helper";
import type { FlattenPaths, DeepPick, SearchQuery, FilterQuery, UpdateSet } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { InferInsert } from "./value";

// --- REPOSITORY PROFILES CONFIGURATION ---
/**
 * Configuration for a specific repository profile.
 * Optimized with depth 2 for paths to keep IDE autocomplete fast during setup.
 */
export type RepoProfileConfig<
  TSchema extends {
    db: AnyDatabase;
    tables: readonly AnyTable[];
    metadata: any;
  },
  TTableName extends string,
  // We use a shallow depth (2) for configuration to ensure the IDE stays snappy.
  // Full depth is still supported in actual queries.
  TEntityPaths = FlattenPaths<InferEntity<TSchema, TTableName, []>, "", 2> | "*",
  TInsertKeys =
    | (keyof InferInsert<FindTable<TSchema["tables"], TTableName>> & string)
    | "*",
> = {
  allowedSets?: readonly TInsertKeys[];
  allowedProjections?: readonly TEntityPaths[];
  allowedFilters?: readonly TEntityPaths[];
  allowedSorts?: readonly TEntityPaths[];
};

export type DbQueryResult<TEntity, Q extends { projection?: any }> =
  Q["projection"] extends Array<string>
    ? DeepPick<TEntity, Q["projection"][number]>
    : TEntity;

export type Repository<
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
  createOne: (
    data: TInsert,
    profile?: TProfileNames | TProfileNames[],
  ) => Promise<TEntity>;
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

  searchDeletedOne: <
    Q extends Pick<SearchQuery<TEntity>, "projection" | "filter">,
  >(
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
  searchDeletedMany: <
    Q extends Omit<SearchQuery<TEntity>, "page" | "pageSize">,
  >(
    query: Q,
    profile?: TProfileNames | TProfileNames[],
  ) => Promise<DbQueryResult<TEntity, Q>[]>;

  updateOne: (
    id: string | number,
    set: UpdateSet<NonNullable<TInsert>>,
    profile?: TProfileNames | TProfileNames[],
  ) => Promise<TEntity | null>;
  updateMany: (
    filter: FilterQuery<TEntity>,
    set: UpdateSet<NonNullable<TInsert>>,
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
