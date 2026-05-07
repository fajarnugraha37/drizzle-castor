import type { DbSearchQuery } from "./base";
import type { InferEntity, FindTable, InferModel } from "./helper";
import type { FilterQuery } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { InferInsert, SoftDeleteConfig, DbAction } from "./value";

// --- HOOKS CONFIGURATION ---
export type TableHooks<
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
  beforeRestore?: (filter: FilterQuery<TEntity>) => Promise<void> | void;
  afterRestore?: (affected: TEntity[]) => Promise<void> | void;
  beforeHardDelete?: (filter: FilterQuery<TEntity>) => Promise<void> | void;
  afterHardDelete?: (affected: TEntity[]) => Promise<void> | void;
};

export type TableConfig<
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
