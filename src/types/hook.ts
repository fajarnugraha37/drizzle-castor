import type { DbSearchQuery } from "./base";
import type { InferEntity, FindTable, InferModel } from "./helper";
import type { FilterQuery } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { InferInsert, SoftDeleteConfig, DbAction } from "./value";
import type { Middleware } from "../middleware/index";
import type { ExecutionContext } from "./context";

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
  TContext = ExecutionContext<TSchema["db"], TSchema["tables"]>,
> = {
  beforeSearch?: (
    query: DbSearchQuery<TSchema, TTableName>,
    ctx: TContext,
  ) => Promise<void> | void;
  afterSearch?: (
    query: DbSearchQuery<TSchema, TTableName>,
    result: TEntity[],
    ctx: TContext,
  ) => Promise<void> | void;
  beforeCreate?: (data: TInsert | TInsert[], ctx: TContext) => Promise<void> | void;
  afterCreate?: (data: TEntity | TEntity[], ctx: TContext) => Promise<void> | void;
  beforeUpdate?: (
    set: Partial<TInsert>,
    affected: FilterQuery<TEntity>,
    ctx: TContext,
  ) => Promise<void> | void;
  afterUpdate?: (
    set: Partial<TInsert>,
    affected: TEntity[],
    ctx: TContext,
  ) => Promise<void> | void;
  beforeSoftDelete?: (filter: FilterQuery<TEntity>, ctx: TContext) => Promise<void> | void;
  afterSoftDelete?: (affected: TEntity[], ctx: TContext) => Promise<void> | void;
  beforeRestore?: (filter: FilterQuery<TEntity>, ctx: TContext) => Promise<void> | void;
  afterRestore?: (affected: TEntity[], ctx: TContext) => Promise<void> | void;
  beforeHardDelete?: (filter: FilterQuery<TEntity>, ctx: TContext) => Promise<void> | void;
  afterHardDelete?: (affected: TEntity[], ctx: TContext) => Promise<void> | void;
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
  middlewares?: Middleware[];
};
