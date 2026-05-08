import { expect, test, describe, mock } from "bun:test";
import { createRbacMiddleware } from "../../../src/middleware/table-rbac";
import { AccessDeniedError } from "../../../src/errors";
import type { MiddlewareContext } from "../../../src/middleware/index";

describe("Table-Level RBAC Middleware", () => {
  const createMockContext = (
    action: any,
    tableName: string,
    profile: any,
    metadataProfiles: any
  ): MiddlewareContext => ({
    action,
    tableName,
    profile,
    params: {} as any,
    state: {},
    translatorContext: {
      metadata: {
        [tableName]: {
          profiles: metadataProfiles
        }
      }
    } as any
  });

  describe("Configuration Modes", () => {
    test("Lenient Mode: Allows access when no table config exists", async () => {
      const middleware = createRbacMiddleware("lenient");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("read", "users", "admin", undefined);
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("Lenient Mode: Allows access when profiles object is empty", async () => {
      const middleware = createRbacMiddleware("lenient");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("read", "users", "admin", {});
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("Strict Mode: Throws error when no table config exists", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve());
      const ctx = createMockContext("read", "users", "admin", undefined);
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
      expect(middleware(ctx, next)).rejects.toThrow(/no profiles defined in strict mode/);
    });

    test("Strict Mode: Throws error when profiles object is empty", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve());
      const ctx = createMockContext("read", "users", "admin", {});
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
    });
  });

  describe("Profile Fallback", () => {
    test("Falls back to 'default' profile when profile is undefined", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("read", "users", undefined, { default: ["read"] });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("Falls back to 'default' profile when profile is an empty array", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("read", "users", [], { default: ["read"] });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("Access Verification", () => {
    test("Single Profile: Allows access if action is permitted", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("create", "posts", "editor", { editor: ["create", "read"] });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("Single Profile: Denies access if action is not permitted", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve());
      const ctx = createMockContext("update", "posts", "reader", { reader: ["read"] });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
      expect(middleware(ctx, next)).rejects.toThrow(/Action 'update' is denied for profiles 'reader'/);
    });

    test("Multiple Profiles: Allows access if AT LEAST ONE profile permits", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("update", "posts", ["reader", "editor"], { 
        reader: ["read"], 
        editor: ["read", "update"] 
      });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });

    test("Multiple Profiles: Denies access if NO profile permits", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve());
      const ctx = createMockContext("hardDelete", "posts", ["reader", "editor"], { 
        reader: ["read"], 
        editor: ["read", "update"] 
      });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
      expect(middleware(ctx, next)).rejects.toThrow(/Action 'hardDelete' is denied for profiles 'reader, editor'/);
    });

    test("Missing Profiles: Throws specific error if NONE of the requested profiles exist", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve());
      const ctx = createMockContext("read", "users", ["ghost", "phantom"], { 
        default: ["read"] 
      });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
      expect(middleware(ctx, next)).rejects.toThrow(/None of the profiles 'ghost, phantom' are defined/);
    });

    test("Mixed Profiles: Continues checking if some profiles are missing but others exist and permit", async () => {
      const middleware = createRbacMiddleware("strict");
      const next = mock(() => Promise.resolve("success"));
      const ctx = createMockContext("read", "users", ["ghost", "reader"], { 
        reader: ["read"] 
      });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});