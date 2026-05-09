import { expect, test, describe } from "bun:test";
import { composeMiddleware } from "../../../src/middleware/middleware";
import type { ExecutionContext, Middleware } from "../../../src/types";

describe("composeMiddleware", () => {
  test("Catches synchronous errors thrown in middleware", async () => {
    const errorMiddleware: Middleware = (ctx, next) => {
      throw new Error("Synchronous error");
    };

    const pipeline = composeMiddleware([errorMiddleware]);
    const ctx = {} as ExecutionContext<any, any>;
    
    await expect(pipeline(ctx, async () => "success")).rejects.toThrow("Synchronous error");
  });

  test("Rejects if next() is called multiple times", async () => {
    const badMiddleware: Middleware = async (ctx, next) => {
      await next();
      await next(); // multiple calls
      return "done";
    };

    const pipeline = composeMiddleware([badMiddleware]);
    const ctx = {} as ExecutionContext<any, any>;
    
    await expect(pipeline(ctx, async () => "success")).rejects.toThrow("next() called multiple times");
  });
});