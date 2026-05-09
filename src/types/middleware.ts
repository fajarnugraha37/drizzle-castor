import type { ExecutionContext } from "./context";
import type { AnyDatabase, AnyTable, TableName } from "./schema-metadata";
import type { DbAction } from "./value";

export type MiddlewareNext<T = any> = () => Promise<T>;

export type Middleware<
  T = any,
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
> = (
  ctx: ExecutionContext<TDb, TTables>,
  next: MiddlewareNext<T>,
) => Promise<T>;

export type MiddlewareConfig<TTables extends readonly AnyTable[] = any> = {
  tables?: TableName<TTables[number]> | TableName<TTables[number]>[];
  actions?: DbAction | DbAction[];
};
