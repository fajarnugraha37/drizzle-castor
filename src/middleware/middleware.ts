import type {
  AnyDatabase,
  AnyTable,
  Middleware,
  ExecutionContext,
  MiddlewareNext
} from "../types";

/**
 * Helper to compose an array of middleware into a single executable function
 */
export function composeMiddleware<T = any, TDb extends AnyDatabase = any, TTables extends readonly AnyTable[] = any>(
  middleware: Middleware<T, TDb, TTables>[],
): (ctx: ExecutionContext<TDb, TTables>, next: MiddlewareNext<T>) => Promise<T> {
  return function (context: ExecutionContext<TDb, TTables>, next: MiddlewareNext<T>) {
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