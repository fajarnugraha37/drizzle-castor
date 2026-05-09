import { expect, test, describe, mock } from "bun:test";
import { createUnifiedRbacMiddleware } from "../../../src/middleware/unified-rbac";
import { AccessDeniedError } from "../../../src/errors";

describe("Unified RBAC Middleware - Declarative Policies", () => {
  const createContext = (action: any, profile: string | string[], query: any = {}, set: any = {}, data: any = {}) => ({
    action,
    tableName: "users",
    profile,
    params: { query, set, data },
    state: {},
    translatorContext: {
      emitter: { emit: mock(() => {}) }
    }
  } as any);

  const next = mock(() => Promise.resolve("success"));

  test("Allows action if wildcard is present in policies", async () => {
    const policy = { default: { allowedActions: "*" as const } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    const ctx = createContext("read", "default");
    
    const result = await middleware(ctx, next);
    expect(result).toBe("success");
    expect(next).toHaveBeenCalled();
  });

  test("Throws AccessDenied if action is not allowed", async () => {
    const policy = { default: { allowedActions: ["read"] as any } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    const ctx = createContext("create", "default");
    
    expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Trims unallowed fields from projection and throws if empty", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedProjections: ["id", "name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("read", "default", { projection: ["id", "name", "secret"] });
    await middleware(ctx, next);
    
    // 'secret' should be trimmed
    expect(ctx.params.query.projection).toEqual(["id", "name"]);

    // If projection becomes empty, it should throw
    const badCtx = createContext("read", "default", { projection: ["secret"] });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Trims unallowed fields from set for update action", async () => {
    const policy = { default: { allowedActions: ["update"] as any, allowedSets: ["name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("update", "default", {}, { name: "John", role: "admin" });
    await middleware(ctx, next);
    
    // 'role' should be trimmed
    expect(ctx.params.set).toEqual({ name: "John" });
    
    // If set becomes empty, it should throw
    const badCtx = createContext("update", "default", {}, { role: "admin" });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Logs warnings instead of throwing if isThrowError is false", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedProjections: ["id", "name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false); // isThrowError = false
    
    const ctx = createContext("read", "default", { projection: ["id", "secret"] });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["id"]);
    expect(ctx.state.warnings).toBeDefined();
    expect(ctx.state.warnings.length).toBeGreaterThan(0);
    expect(ctx.state.warnings[0]).toContain("Trimming unallowed fields");
  });

  test("Combines policies from multiple profiles correctly", async () => {
    const policy = {
      user: { allowedActions: ["read"] as any, allowedProjections: ["id"] },
      editor: { allowedActions: ["update"] as any, allowedProjections: ["name"], allowedSets: ["name"] }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    // With both profiles, should be able to read and update, and see id and name
    const ctx = createContext("update", ["user", "editor"], { projection: ["id", "name", "secret"] }, { name: "Test" });
    await middleware(ctx, next);
    
    expect(ctx.params.query.projection).toEqual(["id", "name"]);
    expect(ctx.params.set).toEqual({ name: "Test" });
  });

  test("Throws AccessDenied if policy is missing in strict mode", async () => {
    const middleware = createUnifiedRbacMiddleware(undefined, "strict", true);
    const ctx = createContext("read", "default");
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Passes through if policy is missing in lenient mode", async () => {
    const middleware = createUnifiedRbacMiddleware(undefined, "lenient", true);
    const ctx = createContext("read", "default");
    const result = await middleware(ctx, next);
    expect(result).toBe("success");
  });

  test("Handles empty profile array by falling back to default", async () => {
    const policy = { default: { allowedActions: ["read"] as any } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    const ctx = createContext("read", []);
    const result = await middleware(ctx, next);
    expect(result).toBe("success");
  });

  test("Throws if none of the profiles match the policy", async () => {
    const policy = { admin: { allowedActions: ["read"] as any } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    const ctx = createContext("read", "unknown_profile");
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Throws AccessDenied if handleFields trims everything and isThrowError is true", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedProjections: ["id"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true); // isThrowError = true
    const ctx = createContext("read", "default", { projection: ["secret"] });
    
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Wildcard matching overrides arrays in policy merging", async () => {
    const policy = {
      p1: { allowedActions: ["read"] as any, allowedProjections: ["id"], allowedFilters: ["name"], allowedSorts: ["age"], allowedSets: ["email"] },
      p2: { allowedActions: "*" as const, allowedProjections: "*" as const, allowedFilters: "*" as const, allowedSorts: "*" as const, allowedSets: "*" as const }
    };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", true);
    const ctx = createContext("update", ["p1", "p2", "missing"], { projection: ["secret"], filter: { secret: { $eq: 1 } }, order: { secret: "asc" } }, { secret: 1 });
    const result = await middleware(ctx, next);
    expect(result).toBe("success");
  });

  test("Trims filter objects correctly", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedFilters: ["name", "age"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    // Arrays, conjunctions, unknown keywords, valid fields, invalid fields
    const filter = {
      $and: [
        { name: { $eq: "John" } },
        { secret: { $eq: "Hidden" } }
      ],
      $unknown: { a: 1 },
      age: { $gt: 18 },
      status: { $eq: "active" }
    };
    
    const ctx = createContext("read", "default", { filter });
    await middleware(ctx, next);
    
    expect(ctx.params.query.filter).toEqual({
      $and: [
        { name: { $eq: "John" } }
      ],
      age: { $gt: 18 }
    });
  });

  test("Throws if filter object becomes empty after trimming", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedFilters: ["name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { filter: { secret: { $eq: "Hidden" } } });
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Throws if filtering is strictly denied", async () => {
    const policy = { default: { allowedActions: ["read"] as any } }; // allowedFilters is undefined
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { filter: { name: { $eq: "John" } } });
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Trims order (sorts) correctly", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedSorts: ["name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    const ctx = createContext("read", "default", { order: { name: "asc", secret: "desc" } });
    await middleware(ctx, next);
    expect(ctx.params.query.order).toEqual({ name: "asc" });

    const badCtx = createContext("read", "default", { order: { secret: "desc" } });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Trims create data correctly for single and array objects", async () => {
    const policy = { default: { allowedActions: ["create"] as any, allowedSets: ["name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    
    // Single object
    const ctxSingle = createContext("create", "default", {}, {}, { name: "John", secret: "Hidden" });
    await middleware(ctxSingle, next);
    expect(ctxSingle.params.data).toEqual({ name: "John" });

    // Array of objects
    const ctxArray = createContext("create", "default", {}, {}, [{ name: "Jane", secret: "Hidden" }]);
    await middleware(ctxArray, next);
    expect(ctxArray.params.data).toEqual([{ name: "Jane" }]);

    // Empty after trim
    const badCtx = createContext("create", "default", {}, {}, { secret: "Hidden" });
    await expect(middleware(badCtx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Throws if projection is strictly denied", async () => {
    const policy = { default: { allowedActions: ["read"] as any } }; // allowedProjections undefined
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { projection: ["id"] });
    await expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
  });

  test("Deletes query.order if it has no keys", async () => {
    const policy = { default: { allowedActions: ["read"] as any, allowedSorts: ["name"] } };
    const middleware = createUnifiedRbacMiddleware(policy, "strict", false);
    const ctx = createContext("read", "default", { order: {} });
    await middleware(ctx, next);
    expect(ctx.params.query.order).toBeUndefined();
  });
});