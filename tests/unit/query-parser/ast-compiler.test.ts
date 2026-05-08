import { expect, test, describe, mock } from "bun:test";
import { buildSelection, parseFilter, parseOrder, applyJoins } from "../../../src/query-parser/ast-compiler";
import { SecurityError, AliasNotFoundError, TableNotFoundError, ColumnNotFoundError } from "../../../src/errors";
import { sql } from "drizzle-orm";

const drizzleName = Symbol.for("drizzle:Name");
const drizzleColumns = Symbol.for("drizzle:Columns");

describe("Query Parser: AST Compiler", () => {
  const mockDb = { dialect: { constructor: { name: "PgDialect" } } };
  
  const createMockTable = (name: string, cols: Record<string, any>) => {
    const table = {
      [drizzleName]: name,
      [drizzleColumns]: cols,
      ...cols
    };
    return table;
  };

  const usersColumns = {
    id: sql`id`,
    name: sql`name`,
    settings: sql`settings`
  };
  const mockBaseTable = createMockTable("users", usersColumns);

  const profilesColumns = { id: sql`id`, userId: sql`userId`, age: sql`age` };
  const postsColumns = { id: sql`id`, userId: sql`userId`, title: sql`title` };
  const groupsColumns = { id: sql`id`, name: sql`name` };
  const usersGroupsColumns = { userId: sql`userId`, groupId: sql`groupId` };

  const mockProfilesTable = createMockTable("profiles", profilesColumns);
  const mockPostsTable = createMockTable("posts", postsColumns);
  const mockGroupsTable = createMockTable("groups", groupsColumns);
  const mockUsersGroupsTable = createMockTable("users_groups", usersGroupsColumns);

  const mockMetadata = {
    users: {
      oneToOne: [{ relationName: "profile", relatedTable: "profiles", localKey: "users.id", foreignKey: "profiles.userId" }],
      oneToMany: [{ relationName: "posts", relatedTable: "posts", localKey: "users.id", foreignKey: "posts.userId" }],
      manyToMany: [{ 
        relationName: "groups", 
        relatedTable: "groups", 
        joinTable: "users_groups",
        localKey: "users.id",
        joinLocalKey: "users_groups.userId",
        relatedKey: "groups.id",
        joinRelatedKey: "users_groups.groupId"
      }]
    },
    profiles: { columns: { id: { }, userId: { }, age: { } } },
    posts: { columns: { id: { }, userId: { }, title: { } } },
    groups: { columns: { id: { }, name: { } } },
    users_groups: { columns: { userId: { }, groupId: { } } }
  };

  // Mock drizzle-orm's getTableColumns for ast-compiler tests
  mock.module("drizzle-orm", () => {
    const original = require("drizzle-orm");
    return {
      ...original,
      getTableName: (table: any) => table[drizzleName],
      getTableColumns: (table: any) => table[drizzleColumns] || {},
    };
  });

  describe("buildSelection", () => {
    const mockAliasMap = new Map<string, any>();
    mockAliasMap.set("profile", mockProfilesTable);

    test("Returns undefined if projection is empty", () => {
      expect(buildSelection([], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
      expect(buildSelection(undefined, "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
    });

    test("Builds selection object for valid fields, including relations", () => {
      const sel = buildSelection(["name", "profile.age"], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users.id).toBeDefined();
      expect(sel.users.name).toBeDefined();
      expect(sel.rel_profile).toBeDefined();
    });

    test("Generates JSON extraction SQL for JSON paths in selection", () => {
      const sel = buildSelection(["settings.theme"], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users["settings.theme"]).toBeDefined();
    });
  });

  describe("applyJoins", () => {
    const tables = [mockBaseTable, mockProfilesTable, mockPostsTable, mockGroupsTable, mockUsersGroupsTable];
    const mockAliasMap = new Map<string, any>();
    mockAliasMap.set("profile", mockProfilesTable);
    mockAliasMap.set("posts", mockPostsTable);
    mockAliasMap.set("groups", mockGroupsTable);

    const createMockQb = () => ({
      leftJoin: mock(function() { return this; })
    });

    test("Applies simple left joins", () => {
      const qb = createMockQb();
      const paths = new Set(["profile", "posts"]);
      applyJoins(qb, paths, tables, mockMetadata, "users", mockBaseTable, mockAliasMap, {});
      expect(qb.leftJoin).toHaveBeenCalledTimes(2);
    });

    test("Applies many-to-many joins with bridge table", () => {
      const qb = createMockQb();
      const paths = new Set(["groups"]);
      applyJoins(qb, paths, tables, mockMetadata, "users", mockBaseTable, mockAliasMap, {});
      // One join for bridge, one for target = 2 joins
      expect(qb.leftJoin).toHaveBeenCalledTimes(2);
    });

    test("Throws AliasNotFoundError if parent alias missing", () => {
      const qb = createMockQb();
      // "posts.userId" is a physical column, but let's assume we have a nested relation
      const nestedMetadata = {
        ...mockMetadata,
        posts: {
          ...mockMetadata.posts,
          oneToMany: [{ relationName: "comments", relatedTable: "comments", localKey: "posts.id", foreignKey: "comments.postId" }]
        },
        comments: { columns: { id: {}, postId: {} } }
      };
      const paths = new Set(["posts.comments"]);
      const incompleteAliasMap = new Map();
      incompleteAliasMap.set("posts.comments", {}); // but "posts" is missing
      
      expect(() => {
        applyJoins(qb, paths, tables, nestedMetadata, "users", mockBaseTable, incompleteAliasMap, {});
      }).toThrow(AliasNotFoundError);
    });

    test("Applies soft delete filters in join condition with function deleteValue", () => {
      const qb = createMockQb();
      const paths = new Set(["posts"]);
      const metaWithFunc = {
        ...mockMetadata,
        posts: {
          ...mockMetadata.posts,
          softDelete: { deleteValue: { userId: () => 1 } }
        }
      };
      const resolvedSd = {
        posts: { delete: { userId: 1 } }
      };
      applyJoins(qb, paths, tables, metaWithFunc, "users", mockBaseTable, mockAliasMap, resolvedSd);
      expect(qb.leftJoin).toHaveBeenCalled();
    });
  });

  describe("parseFilter", () => {
    const mockAliasMap = new Map();
    test("Parses $not operator with valid condition", () => {
      const f = parseFilter({ $not: { name: { $eq: "John" } } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });

    test("Parses nested $and/$or operators", () => {
      const f = parseFilter({ $and: [{ name: { $eq: "A" } }, { $or: [{ id: { $eq: 1 } }] }] }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });
    
    test("Handles field paths via aliasMap", () => {
      mockAliasMap.set("profile", mockProfilesTable);
      const f = parseFilter({ "profile.userId": { $eq: 1 } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });

    test("Returns undefined for empty filter", () => {
      expect(parseFilter({}, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeUndefined();
      expect(parseFilter(null, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeUndefined();
    });
    
    test("Parses flat field filters", () => {
      const f = parseFilter({ name: { $eq: "John" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined(); // Returns an SQL condition
    });

    test("Parses logical operators ($and, $or, $not)", () => {
      const f = parseFilter({ $or: [{ name: { $eq: "A" } }, { name: { $eq: "B" } }] }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });
  });

  describe("parseOrder", () => {
    const mockAliasMap = new Map();
    
    test("Returns empty array for empty order", () => {
      expect(parseOrder({}, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toEqual([]);
      expect(parseOrder(undefined, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toEqual([]);
    });

    test("Parses string direction", () => {
      const o = parseOrder({ name: "desc" }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o.length).toBe(1);
    });

    test("Throws ColumnNotFoundError for unknown columns in order", () => {
      expect(() => {
        parseOrder({ unknown: "asc" }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      }).toThrow(ColumnNotFoundError);
    });

    test("Parses order with nulls position", () => {
      const o = parseOrder({ name: { direction: "asc", nulls: "first" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o.length).toBe(1);
      
      const o2 = parseOrder({ name: { direction: "desc", nulls: "last" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o2.length).toBe(1);
    });

    test("Parses object config (direction, nulls)", () => {
      const o = parseOrder({ name: { direction: "asc", nulls: "last" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o.length).toBe(1);
    });

    test("Parses valid aggregations", () => {
      const o = parseOrder({ name: { aggregate: "max" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o.length).toBe(1);
    });

    test("Throws SecurityError for invalid aggregations", () => {
      expect(() => {
        parseOrder({ name: { aggregate: "DROP TABLE" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      }).toThrow(SecurityError);
    });
  });
});