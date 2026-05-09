import type { InferEntity, FindTable } from "./helper";
import type { FlattenPaths, DeepPick, SearchQuery, FilterQuery, UpdateSet } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { InferInsert } from "./value";

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
  TEntity = InferEntity<TSchema, TTableName>,
  TInsert = InferInsert<FindTable<TSchema["tables"], TTableName>>,
> = {
  // --- FACTORY METHODS (Type Isolation) ---
  defineFilter: (filter: FilterQuery<TEntity>) => FilterQuery<TEntity>;
  defineProjection: <P extends FlattenPaths<TEntity>[]>(p: P) => P;
  defineQuery: <Q extends SearchQuery<TEntity>['order']>(query: Q) => Q;
  defineUpdateSet: (set: UpdateSet<NonNullable<TInsert>>) => UpdateSet<NonNullable<TInsert>>;
  defineInsertValue: (data: TInsert) => TInsert;

  // --- CORE METHODS ---
  createOne: (
    data: TInsert,
    profile?: string | string[],
  ) => Promise<TEntity>;
  createMany: (
    data: TInsert[],
    profile?: string | string[],
  ) => Promise<TEntity[]>;

  searchOne: <Q extends Pick<SearchQuery<TEntity>, "projection" | "filter" | "order">>(
    query: Q,
    profile?: string | string[],
  ) => Promise<DbQueryResult<TEntity, Q> | null>;
  searchPage: <Q extends SearchQuery<TEntity>>(
    query: Q,
    profile?: string | string[],
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
    profile?: string | string[],
  ) => Promise<DbQueryResult<TEntity, Q>[]>;

  searchDeletedOne: <
    Q extends Pick<SearchQuery<TEntity>, "projection" | "filter" | "order">,
  >(
    query: Q,
    profile?: string | string[],
  ) => Promise<DbQueryResult<TEntity, Q> | null>;
  searchDeletedPage: <Q extends SearchQuery<TEntity>>(
    query: Q,
    profile?: string | string[],
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
    profile?: string | string[],
  ) => Promise<DbQueryResult<TEntity, Q>[]>;

  updateOne: (
    id: string | number,
    set: UpdateSet<NonNullable<TInsert>>,
    profile?: string | string[],
  ) => Promise<TEntity | null>;
  updateMany: (
    filter: FilterQuery<TEntity>,
    set: UpdateSet<NonNullable<TInsert>>,
    profile?: string | string[],
  ) => Promise<TEntity[]>;

  softDeleteOne: (
    id: string | number,
    profile?: string | string[],
  ) => Promise<boolean>;
  softDeleteMany: (
    filter: FilterQuery<TEntity>,
    profile?: string | string[],
  ) => Promise<number>;

  restoreOne: (
    id: string | number,
    profile?: string | string[],
  ) => Promise<boolean>;
  restoreMany: (
    filter: FilterQuery<TEntity>,
    profile?: string | string[],
  ) => Promise<number>;

  hardDeleteOne: (
    id: string | number,
    profile?: string | string[],
  ) => Promise<boolean>;
  hardDeleteMany: (
    filter: FilterQuery<TEntity>,
    profile?: string | string[],
  ) => Promise<number>;
};
