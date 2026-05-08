import { expect, test, describe } from "bun:test";
import { isFilterSimple, buildExistsCondition, buildSearchQueries } from "../../../src/query-parser/filter-builder";
import { TableNotFoundError } from "../../../src/errors";
import { sql } from "drizzle-orm";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

describe("Query Parser: filter-builder", () => {
  const users = sqliteTable("users", {
    id: integer("id").primaryKey(),
    name: text("name"),
  });
  const posts = sqliteTable("posts", {
    id: integer("id").primaryKey(),
    title: text("title"),
    userId: integer("user_id"),
  });
  
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  
  const mockMetadata = {
    users: {
      columns: { id: { primaryKey: true } },
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }]
    },
    posts: {
      columns: { id: { primaryKey: true } }
    }
  };

  const context: any = {
    db,
    tables: [users, posts],
    metadata: mockMetadata,
    baseTableName: "users",
  };

  describe("isFilterSimple", () => {
    test("returns true for null/undefined filter", () => {
      expect(isFilterSimple(null, mockMetadata, "users")).toBe(true);
      expect(isFilterSimple(undefined, mockMetadata, "users")).toBe(true);
    });

    test("returns true when filter only touches base table", () => {
      expect(isFilterSimple({ name: { $eq: "John" } }, mockMetadata, "users")).toBe(true);
    });

    test("returns false when filter touches relations", () => {
      expect(isFilterSimple({ "posts.title": { $eq: "Hello" } }, mockMetadata, "users")).toBe(false);
    });
  });

  describe("buildSearchQueries", () => {
    test("throws TableNotFoundError if base table is not found", async () => {
      const badContext = { ...context, baseTableName: "unknown" };
      await expect(buildSearchQueries({} as any, badContext)).rejects.toThrow(TableNotFoundError);
    });

    test("builds basic search queries with no filter, order, or projection", async () => {
      const res = await buildSearchQueries({} as any, context);
      expect(res.cteQuery).toBeDefined();
      expect(res.mainQuery).toBeDefined();
      expect(res.countQuery).toBeDefined();
      expect(res.paths).toEqual([]);
    });

    test("builds search queries with pagination (default values)", async () => {
      const res = await buildSearchQueries({} as any, context, true);
      const sqlObj = res.cteQuery.toSQL();
      expect(sqlObj.sql.toLowerCase()).toContain("limit ?");
      expect(sqlObj.params).toContain(10); // default pageSize
    });

    test("builds search queries with explicit pagination", async () => {
      const res = await buildSearchQueries({ page: 2, pageSize: 5 } as any, context, true);
      const sqlObj = res.cteQuery.toSQL();
      expect(sqlObj.sql.toLowerCase()).toContain("limit ?");
      expect(sqlObj.sql.toLowerCase()).toContain("offset ?");
      expect(sqlObj.params).toContain(5); // limit
      expect(sqlObj.params).toContain(5); // offset (page-1)*pageSize
    });
    
    test("builds search queries with filters and orders", async () => {
      const res = await buildSearchQueries({ filter: { name: { $eq: "A" } }, order: { name: "asc" } } as any, context, false);
      const sqlStr = res.cteQuery.toSQL().sql.toLowerCase();
      expect(sqlStr).toContain("where");
      expect(sqlStr).toContain("order by");
    });
    
    test("builds search queries with array relations order by causing needsGroupBy", async () => {
      const res = await buildSearchQueries({ order: { "posts.title": "asc" } } as any, context, false);
      const sqlStr = res.cteQuery.toSQL().sql.toLowerCase();
      expect(sqlStr).toContain("group by");
    });
    
    test("builds queries handling soft deletes pre-resolution", async () => {
       const mockMetaSd = {
         users: {
           columns: { id: { primaryKey: true } },
           softDelete: { deleteValue: "deleted", restoreValue: "active" }
         }
       };
       const ctx = { ...context, metadata: mockMetaSd };
       const res = await buildSearchQueries({} as any, ctx, false);
       expect(res).toBeDefined();
    });

    test("builds queries with projection", async () => {
      const res = await buildSearchQueries({ projection: ["name"] } as any, context, false);
      const sqlStr = res.mainQuery.toSQL().sql.toLowerCase();
      expect(sqlStr).toContain("name");
    });

    test("handles complex filters (and/or/not)", async () => {
      const filter = {
        $or: [
          { name: { $eq: "A" } },
          { $and: [{ id: { $gt: 1 } }, { name: { $ne: "B" } }] }
        ]
      };
      const res = await buildSearchQueries({ filter } as any, context, false);
      expect(res.cteQuery.toSQL().sql.toLowerCase()).toContain("where");
    });
  });

  describe("buildExistsCondition", () => {
    test("builds exists condition successfully without filter", async () => {
      const condition = await buildExistsCondition(null, context, users);
      expect(condition).toBeDefined();
    });

    test("builds exists condition successfully with filter", async () => {
      const condition = await buildExistsCondition({ name: { $eq: "A" } }, context, users);
      expect(condition).toBeDefined();
    });
    
    test("builds exists condition with relation filter", async () => {
       const condition = await buildExistsCondition({ "posts.title": { $eq: "Post 1" } }, context, users);
       expect(condition).toBeDefined();
       // To get SQL from a SQL object, we wrap it in a dummy select
       const sqlObj = db.select().from(users).where(condition).toSQL();
       const sqlStr = sqlObj.sql.toLowerCase();
       expect(sqlStr).toContain("exists");
       expect(sqlStr).toContain("sub_users_correlate");
    });

    test("builds exists condition with soft delete pre-resolution provider value", async () => {
      const mockMetaSd = {
         users: {
           columns: { id: { primaryKey: true } },
           softDelete: { deleteValue: async () => "deleted", restoreValue: async () => "active" }
         }
       };
       const ctx = { ...context, metadata: mockMetaSd };
       const condition = await buildExistsCondition({ name: { $eq: "A" } }, ctx, users);
       expect(condition).toBeDefined();
    });
  });
});
