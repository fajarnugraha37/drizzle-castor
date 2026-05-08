import type { DbAction, SearchQuery, FilterQuery, UpdateSet } from "../types";

export type MiddlewareContext<T = any> = {
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
  translatorContext: any;
  /** Custom state bag for middleware to pass data down the chain */
  state: Record<string, any>;
};

export type MiddlewareNext<T = any> = () => Promise<T>;

export type Middleware<T = any> = (
  ctx: MiddlewareContext<T>,
  next: MiddlewareNext<T>,
) => Promise<T>;

/**
 * Helper to compose an array of middleware into a single executable function
 */
export function composeMiddleware<T = any>(
  middleware: Middleware<T>[],
): (ctx: MiddlewareContext<T>, next: MiddlewareNext<T>) => Promise<T> {
  return function (context: MiddlewareContext<T>, next: MiddlewareNext<T>) {
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