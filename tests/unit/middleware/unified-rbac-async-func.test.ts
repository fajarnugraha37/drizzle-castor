import { expect, test, describe, mock } from "bun:test";
import { createUnifiedRbacMiddleware } from "../../../src/middleware/unified-rbac";
import { AccessDeniedError } from "../../../src/errors";
import { createSchemaBuilder } from "../../../src";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

describe("Unified RBAC Middleware - Async Function Policies", () => {
  const createContext = (action: any, profile: string | string[], query: any = {}, set: any = {}, data: any = {}) => ({
    action,
    tableName: "users",
    profile,
    params: { query, set, data },
    state: {},
  } as any);

  const next = mock(() => Promise.resolve("success"));

  test("SchemaBuilder Global Policy (Async) fallback applies correctly", async () => {
    const mockTable = sqliteTable("test_table", { id: text("id") });
    
    const builder = createSchemaBuilder({} as any, [mockTable] as const)
      .profiles(["admin", "user"] as const)
      .policies(async (ctx, tableName, profiles) => {
        // Global policy checks table name asynchronously
        if (tableName === "test_table" && profiles.includes("admin")) {
          return { allowedActions: ["read"] as any };
        }
        return { allowedActions: [] as any };
      });
      
    const metadata = builder.build();
    const repo = metadata.repoFactory("test_table");
    
    // We expect the global policy to be hit because no specific policy was defined for test_table.
    // As "user", it returns [] allowedActions, so searchOne throws AccessDeniedError
    await expect(repo.searchOne({}, "user")).rejects.toThrow(AccessDeniedError);
  });

  test("Resolves imperative policies dynamically (async function)", async () => {
    const policy = async (ctx: any, profiles: string[]) => {
      if (profiles.includes("admin")) {
        return { allowedActions: "*" as const, allowedProjections: "*" as const };
      }
      return { allowedActions: ["read"] as any, allowedProjections: ["id", "name"] };
    };

    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    
    // Admin request
    const adminCtx = createContext("delete", "admin");
    const adminRes = await middleware(adminCtx, next);
    expect(adminRes).toBe("success");

    // Public request
    const publicCtx = createContext("delete", "public");
    expect(middleware(publicCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Promise Func Deletes query.order if it has no keys (Global Callback)", async () => {
    const policy = async (ctx: any, profiles: string[]) => {
      if (profiles.includes("default")) {
        return { 
          allowedActions: ["read"] as any, 
          allowedSorts: ["name"] 
        };
      }
      return {};
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", ["default", "crazy"], { order: { "name": "asc", "age": "desc" } });
    await middleware(ctx, next);

    expect(ctx.params.query.order.age).toBeUndefined();
  });

  test("Promise Func Deletes query.order if it has no keys (Profile Callback)", async () => {
    const policy = { 
      default: async () => {
        return { 
          allowedActions: ["read"] as any, 
          allowedSorts: ["name"] 
        };
      } 
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { order: { "name": "asc", "age": "desc" } });
    await middleware(ctx, next);

    expect(ctx.params.query.order.age).toBeUndefined();
  });

  test("Resolves individual profile mapped to an async callback function", async () => {
    const policy = {
      user: { allowedActions: ["read"] as any, allowedProjections: ["id"] },
      guest: async (ctx: any) => {
        return { allowedActions: ["read"] as any, allowedProjections: ["name"] };
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("read", "guest", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["name"]);
  });

  test("Reject individual profile mapped to an async callback function", async () => {
    const policy = {
      user: { allowedActions: ["read"] as any, allowedProjections: ["id"] },
      guest: async (ctx: any) => {
        return { allowedActions: ["read"] as any, allowedProjections: ["name"] };
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "guest", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["name"]);
    expect(ctx.params.query.projection).not.toContain("secret");
  });

  test("Handles dynamic fields returning async array", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: async (ctx: any) => ["name"] as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["name"]);
  });

  test("Handles dynamic fields returning async wildcard", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: async (ctx: any) => "*" as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["name", "secret"]);
  });

  test("Handles dynamic fields returning invalid async type (null)", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: async (ctx: any) => null as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name"] });
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Merges two dynamic async field functions correctly", async () => {
    const policy = {
      p1: { allowedActions: ["read"] as any, allowedProjections: async () => ["id"] as any },
      p2: { allowedActions: ["read"] as any, allowedProjections: async () => ["name"] as any }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", ["p1", "p2"], { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["id", "name"]);
  });
});