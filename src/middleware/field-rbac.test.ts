import { expect, test, describe, mock } from "bun:test";
import { createFieldRbacMiddleware } from "./field-rbac";
import { AccessDeniedError } from "../errors";
import type { MiddlewareContext } from "./index";

describe("Field-Level RBAC Middleware", () => {
  const createMockContext = (
    action: any,
    profile: any,
    params: any,
  ): MiddlewareContext => ({
    action,
    tableName: "users",
    profile,
    params,
    state: {},
    translatorContext: {} as any
  });

  const options = {
    admin: {
      allowedProjections: ["*"],
      allowedFilters: ["*"],
      allowedSets: ["*"],
      allowedSorts: ["*"],
    },
    public: {
      allowedProjections: ["name", "email", "persona.skills"],
      allowedFilters: ["name", "age"],
      allowedSets: ["name"],
      allowedSorts: ["name"],
    },
    marketing: {
      allowedProjections: ["phone", "name"],
      allowedFilters: ["phone", "email"],
      allowedSets: ["phone"],
      allowedSorts: ["age"],
    },
    empty: {
      allowedProjections: [],
      allowedFilters: [],
      allowedSets: [],
      allowedSorts: [],
    }
  };

  describe("Permission Merging & Trimming vs Throwing", () => {
    test("Multiple Profiles: Merges permissions safely", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", ["public", "marketing"], {
        query: {
          projection: ["name", "email", "phone"],
          filter: { name: { $eq: "John" }, phone: { $eq: "123" } }
        }
      });
      
      const result = await middleware(ctx, next);
      expect(result).toBe("success");
      expect(next).toHaveBeenCalledTimes(1);
      
      // Both should be untouched since public + marketing allows all these fields
      expect(ctx.params.query.projection).toEqual(["name", "email", "phone"]);
      expect(ctx.params.query.filter).toEqual({ name: { $eq: "John" }, phone: { $eq: "123" } });
    });

    test("Empty/Null permissions fallback to denial", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve());
      
      const ctx = createMockContext("read", "empty", {
        query: { projection: ["name"] }
      });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
    });

    test("isThrowError = false: Trims unallowed fields gracefully", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "public", {
        query: {
          projection: ["name", "email", "secret_field"], // public only allows name, email, persona.skills
          filter: { name: { $eq: "John" }, secret_field: { $eq: "Hax" } }, // public only allows name, age
          order: { name: "asc", secret_field: "desc" } // public only allows name
        }
      });
      
      await middleware(ctx, next);
      
      // The secret_field should be trimmed out without throwing
      expect(ctx.params.query.projection).toEqual(["name", "email"]);
      expect(ctx.params.query.filter).toEqual({ name: { $eq: "John" } });
      expect(ctx.params.query.order).toEqual({ name: "asc" });
    });

    test("isThrowError = false: Throws if trimming results in empty query", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "public", {
        query: {
          projection: ["secret_field"],
        }
      });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
    });

    test("isThrowError = true: Throws immediately on unallowed fields", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", true);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "public", {
        query: {
          projection: ["name", "secret_field"],
        }
      });
      
      expect(middleware(ctx, next)).rejects.toThrow(AccessDeniedError);
      expect(middleware(ctx, next)).rejects.toThrow(/secret_field/);
    });
  });

  describe("Deep Path and Array Extraction Handling", () => {
    test("Allows nested fields if the parent field is allowed", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "public", {
        query: {
          // public allows "persona.skills", so persona.skills.0 should be allowed
          projection: ["persona.skills.0", "name"],
        }
      });
      
      await middleware(ctx, next);
      expect(ctx.params.query.projection).toEqual(["persona.skills.0", "name"]);
    });

    test("Implicit Projections: Fills missing projections with allowed ones", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "public", {
        query: { filter: { name: { $eq: "John" } } }
      });
      
      await middleware(ctx, next);
      expect(ctx.params.query.projection).toBeDefined();
      expect(ctx.params.query.projection).toEqual(expect.arrayContaining(["name", "email", "persona.skills"]));
    });

    test("Wildcard Profile: Bypasses all restrictions", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", true);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("read", "admin", {
        query: {
          projection: ["any_field_you_want"],
          filter: { any_field: { $eq: "1" } },
          order: { any_field: "asc" }
        }
      });
      
      await middleware(ctx, next);
      expect(ctx.params.query.projection).toEqual(["any_field_you_want"]);
    });
  });

  describe("Mutation Operations (Sets/Data)", () => {
    test("Update Set: Trims unallowed data on update", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("update", "public", {
        set: { name: "John", age: 30, is_admin: true }
      });
      
      await middleware(ctx, next);
      expect(ctx.params.set).toEqual({ name: "John" }); // public only allows name
    });

    test("Create Data: Trims unallowed data on create", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("create", "public", {
        data: { name: "John", age: 30, is_admin: true }
      });
      
      await middleware(ctx, next);
      expect(ctx.params.data).toEqual({ name: "John" }); // public only allows name
    });
    
    test("Create Many Data: Trims unallowed data on createMany", async () => {
      const middleware = createFieldRbacMiddleware(options as any, "strict", false);
      const next = mock(() => Promise.resolve("success"));
      
      const ctx = createMockContext("create", "public", {
        data: [{ name: "John", age: 30 }, { name: "Jane", is_admin: true }]
      });
      
      await middleware(ctx, next);
      expect(ctx.params.data).toEqual([{ name: "John" }, { name: "Jane" }]); // public only allows name
    });
  });
});