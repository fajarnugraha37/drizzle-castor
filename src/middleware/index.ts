import type {
  DbAction,
  SearchQuery,
  FilterQuery,
  UpdateSet,
  AnyDatabase,
  AnyTable,
  TTranslatorContext,
} from "../types";

export type MiddlewareContext<
  TDb extends AnyDatabase = any,
  TTables extends readonly AnyTable[] = any,
> = {
  /** The action being performed (e.g., 'search', 'create', 'update', 'softDelete') */
  action: DbAction;
  /** The name of the table this action is targeting */
  tableName: string;
  /** The profile(s) making the request */
  profile?: string | string[];
  /** The parameters passed to the action (e.g., SearchQuery, insert data, ID, filter) */
  params: {
    query?: SearchQuery<any>;
    data?: any | any[];
    id?: string | number;
    filter?: FilterQuery<any>;
    set?: UpdateSet<any>;
  };
  /** Internal metadata and Drizzle instances */
  translatorContext: TTranslatorContext<TDb, TTables>;
  /** Custom state bag for middleware to pass data down the chain */
  state: Record<string, any>;
};

export type MiddlewareNext<T = any> = () => Promise<T>;

export type Middleware<T = any, TDb extends AnyDatabase = any, TTables extends readonly AnyTable[] = any> = (
  ctx: MiddlewareContext<TDb, TTables>,
  next: MiddlewareNext<T>,
) => Promise<T>;

/**
 * Helper to compose an array of middleware into a single executable function
 */
export function composeMiddleware<T = any, TDb extends AnyDatabase = any, TTables extends readonly AnyTable[] = any>(
  middleware: Middleware<T, TDb, TTables>[],
): (ctx: MiddlewareContext<TDb, TTables>, next: MiddlewareNext<T>) => Promise<T> {
  return function (context: MiddlewareContext<TDb, TTables>, next: MiddlewareNext<T>) {
    let index = -1;
    return dispatch(0);
    function dispatch(i: number): Promise<T> {
      if (i <= index)
        return Promise.reject(new Error("next() called multiple times"));
      index = i;
      let fn = middleware[i];
      if (i === middleware.length) fn = next as any;
      if (!fn) return Promise.resolve() as any;
      try {
        return Promise.resolve(
          fn(context, dispatch.bind(null, i + 1) as MiddlewareNext<T>),
        );
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}