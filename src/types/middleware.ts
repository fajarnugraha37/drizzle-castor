import type { ExecutionContext } from "./context";
import type { AnyDatabase, AnyTable } from "./schema-metadata";

export type MiddlewareNext<T = any> = () => Promise<T>;

export type Middleware<
  T = any,
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
> = (
  ctx: ExecutionContext<TDb, TTables>,
  next: MiddlewareNext<T>,
) => Promise<T>;
