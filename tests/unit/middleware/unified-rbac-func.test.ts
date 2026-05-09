import { expect, test, describe, mock } from "bun:test";
import { createUnifiedRbacMiddleware } from "../../../src/middleware/unified-rbac";
import { AccessDeniedError } from "../../../src/errors";
import { createSchemaBuilder } from "../../../src";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

describe("Unified RBAC Middleware - Function Policies", () => {
  const createContext = (action: any, profile: string | string[], query: any = {}, set: any = {}, data: any = {}) => ({
    action,
    tableName: "users",
    profile,
    params: { query, set, data },
    state: {},
  } as any);

  const next = mock(() => Promise.resolve("success"));

  test("SchemaBuilder Global Policy (Sync) fallback applies correctly", async () => {
    const mockTable = sqliteTable("test_table", { id: text("id") });
    
    const builder = createSchemaBuilder({} as any, [mockTable] as const)
      .profiles(["admin", "user"] as const)
      .policies((ctx, tableName, profiles) => {
        // Global policy checks table name
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

  test("Resolves imperative policies dynamically (sync function)", async () => {
    const policy = (ctx: any, profiles: string[]) => {
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

  test("Func Deletes query.order if it has no keys", async () => {
    const policy = { 
      default: () => {
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

  test("Resolves individual profile mapped to a sync callback function", async () => {
    const policy = {
      user: { allowedActions: ["read"] as any, allowedProjections: ["id"] },
      guest: (ctx: any) => {
        return { allowedActions: ["read"] as any, allowedProjections: ["name"] };
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("read", "guest", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["name"]);
  });

  test("Reject individual profile mapped to a sync callback function", async () => {
    const policy = {
      user: { allowedActions: ["read"] as any, allowedProjections: ["id"] },
      guest: (ctx: any) => {
        return { allowedActions: ["read"] as any, allowedProjections: ["name"] };
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "guest", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["name"]);
    expect(ctx.params.query.projection).not.toContain("secret");
  });

  test("Handles dynamic fields returning sync array", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: (ctx: any) => ["name"] as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["name"]);
  });

  test("Handles dynamic fields returning sync wildcard", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: (ctx: any) => "*" as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["name", "secret"]);
  });

  test("Handles dynamic fields returning invalid sync type (null)", async () => {
    const policy = {
      default: {
        allowedActions: ["read"] as any,
        allowedProjections: (ctx: any) => null as any
      }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["name"] });
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Merges two dynamic sync field functions correctly", async () => {
    const policy = {
      p1: { allowedActions: ["read"] as any, allowedProjections: () => ["id"] as any },
      p2: { allowedActions: ["read"] as any, allowedProjections: () => ["name"] as any }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", ["p1", "p2"], { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["id", "name"]);
  });

  test("Global sync function policy trims unallowed fields from projection and throws if empty", async () => {
    const policy = (ctx: any, profiles: string[]) => ({
      allowedActions: ["read"] as any, 
      allowedProjections: ["id", "name"]
    });
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("read", "default", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    expect(ctx.params.query.projection).toEqual(["id", "name"]);

    const badCtx = createContext("read", "default", { projection: ["secret"] });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Global sync function policy trims unallowed fields from set for update action", async () => {
    const policy = (ctx: any, profiles: string[]) => ({
      allowedActions: ["update"] as any, 
      allowedSets: ["name"]
    });
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("update", "default", {}, { name: "John", role: "admin" });
    await middleware(ctx, next);
    expect(ctx.params.set).toEqual({ name: "John" });
    
    const badCtx = createContext("update", "default", {}, { role: "admin" });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });
});