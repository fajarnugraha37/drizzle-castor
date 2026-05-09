import type { InferEntity, FindTable, InferModel } from "./helper";
import type { SearchQuery, UpdateQuery, DeleteQuery } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";


export type RecursiveDepth = 5;

export type Dialect = "pg" | "mysql" | "sqlite";

export type CastorErrorCode =
  | "SECURITY_ERROR"
  | "ACCESS_DENIED"
  | "QUERY_PARSING_ERROR"
  | "TABLE_NOT_FOUND"
  | "COLUMN_NOT_FOUND"
  | "RELATION_NOT_FOUND"
  | "ALIAS_NOT_FOUND"
  | "CONFIGURATION_ERROR"
  | "MUTATION_ERROR"
  | "HOOK_ERROR";

export type BaseSchema = {
  db: AnyDatabase;
  tables: readonly AnyTable[];
  metadata: any;
};

// The Generic Query Types
export type DbSearchQuery<
  TSchema extends BaseSchema,
  TTableName extends keyof TSchema["metadata"] & string,
> = SearchQuery<InferEntity<TSchema, TTableName>>;

export type DbUpdateQuery<
  TSchema extends BaseSchema,
  TTableName extends keyof TSchema["metadata"] & string,
> = UpdateQuery<
  InferModel<FindTable<TSchema["tables"], TTableName>>, // Set data
  InferEntity<TSchema, TTableName> // Filter
>;

export type DbDeleteQuery<
  TSchema extends BaseSchema,
  TTableName extends keyof TSchema["metadata"] & string,
> = DeleteQuery<InferEntity<TSchema, TTableName>>;

/**
 * Type for trace ID generator, supporting both sync and async.
 */
export type TraceIdGenerator = () => string | Promise<string>;
