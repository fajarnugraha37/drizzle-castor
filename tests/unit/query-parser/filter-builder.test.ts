import { expect, test, describe, beforeEach } from "bun:test";
import { buildSearchQueries, isFilterSimple, buildExistsCondition } from "../../../src/query-parser/filter-builder";
import { TableNotFoundError } from "../../../src/errors";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { clearResolutionCache } from "../../../src/query-parser/metadata-explorer";

describe("Query Parser: filter-builder", () => {
  beforeEach(() => {
    clearResolutionCache();
  });

  const users = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name"),
  });

  const posts = pgTable("posts", {
    id: serial("id").primaryKey(),
    title: text("title"),
    userId: serial("user_id"),
  });

  const mockMetadata = {
    users: {
      table: users,
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }],
    },
    posts: {
      table: posts,
    }
  } as any;

  const createMockQb = () => {
    const qb: any = {
      where: () => qb,
      limit: () => qb,
      offset: () => qb,
      orderBy: () => qb,
      groupBy: () => qb,
      leftJoin: () => qb,
      innerJoin: () => qb,
      toSQL: () => ({ sql: "SELECT *", params: [] }),
      as: () => qb, // for CTE .as()
      then: (resolve: any) => resolve([]), // Makes it awaitable
    };
    return qb;
  };

  const mockDb = {
    select: () => ({
      from: () => createMockQb(),
    }),
    $with: () => ({
      as: () => ({})
    }),
    with: () => ({
      select: () => ({
        from: () => ({
          innerJoin: () => createMockQb()
        })
      })
    })
  } as any;

  const context = {
    db: mockDb,
    tables: [users, posts],
    metadata: mockMetadata,
    baseTableName: "users",
  } as any;

  describe("isFilterSimple", () => {
    test("returns true for null/undefined filter", () => {
      expect(isFilterSimple(undefined, mockMetadata, "users")).toBe(true);
      expect(isFilterSimple(null, mockMetadata, "users")).toBe(true);
    });

    test("returns true when filter only touches base table", () => {
      expect(isFilterSimple({ name: { $eq: "John" } }, mockMetadata, "users")).toBe(true);
    });

    test("returns false when filter touches relations", () => {
      expect(isFilterSimple({ "posts.title": { $eq: "Hello" } }, mockMetadata, "users")).toBe(false);
    });

    test("returns true for nested simple filters", () => {
       expect(isFilterSimple({ $and: [{ name: "John" }, { age: 20 }] }, mockMetadata, "users")).toBe(true);
    });

    test("returns false for nested complex filters", () => {
       expect(isFilterSimple({ $or: [{ name: "John" }, { "posts.id": 1 }] }, mockMetadata, "users")).toBe(false);
    });
  });

  describe("buildSearchQueries", () => {
    test("throws TableNotFoundError if base table is not found", async () => {
      const badContext = { ...context, baseTableName: "unknown" };
      await expect(buildSearchQueries({} as any, badContext)).rejects.toThrow(TableNotFoundError);
    });

    test("builds queries handling soft deletes pre-resolution", async () => {
       const res = await buildSearchQueries({} as any, context);
       expect(res).toBeDefined();
    });

    test("builds queries with sorting and nulls position", async () => {
       const res = await buildSearchQueries({ 
         order: { name: { direction: "desc", nulls: "first" } } 
       }, context);
       expect(res.mainQuery).toBeDefined();
    });
  });

  describe("buildExistsCondition", () => {
    test("builds exists condition successfully without filter", async () => {
       const condition = await buildExistsCondition({}, context, users);
       expect(condition).toBeDefined();
    });

    test("builds exists condition with soft delete metadata", async () => {
       const ctxWithSD = {
         ...context,
         metadata: {
           users: { softDelete: { column: "deleted", deleteValue: 1, restoreValue: 0 } }
         }
       };
       const condition = await buildExistsCondition({ name: "John" }, ctxWithSD, users);
       expect(condition).toBeDefined();
    });
  });
});
