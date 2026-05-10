import { expect, test, describe, mock, beforeEach } from "bun:test";
import { buildSelection, parseFilter, parseOrder, applyJoins } from "../../../src/query-parser/ast-compiler";
import { SecurityError, AliasNotFoundError, TableNotFoundError, ColumnNotFoundError, QueryParsingError } from "../../../src/errors";
import { pgTable, serial, text, json } from "drizzle-orm/pg-core";
import { clearResolutionCache } from "../../../src/query-parser/metadata-explorer";

describe("Query Parser: AST Compiler", () => {
  beforeEach(() => {
    clearResolutionCache();
  });

  const mockDb = { dialect: { escapeParam: (i: number) => `$${i + 1}` } } as any;
  
  const usersTable = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name"),
    settings: json("settings"),
  });

  const profilesTable = pgTable("profiles", {
    id: serial("id").primaryKey(),
    userId: serial("user_id"),
    age: serial("age"),
  });

  const postsTable = pgTable("posts", {
    id: serial("id").primaryKey(),
    userId: serial("user_id"),
    title: text("title"),
  });

  const groupsTable = pgTable("groups", {
    id: serial("id").primaryKey(),
    name: text("name"),
  });

  const usersGroupsTable = pgTable("users_groups", {
    userId: serial("user_id"),
    groupId: serial("group_id"),
  });

  const mockMetadata = {
    users: {
      table: usersTable,
      oneToOne: [{ 
        relationName: "profile", 
        relatedTable: "profiles",
        localKey: "users.id",
        foreignKey: "profiles.userId"
      }],
      oneToMany: [{ 
        relationName: "posts", 
        relatedTable: "posts",
        localKey: "users.id",
        foreignKey: "posts.userId"
      }],
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
    profiles: { table: profilesTable },
    posts: { table: postsTable },
    groups: { table: groupsTable },
    users_groups: { table: usersGroupsTable }
  } as any;

  describe("buildSelection", () => {
    const mockAliasMap = new Map<string, any>();
    mockAliasMap.set("profile", profilesTable);

    test("Returns undefined if projection is undefined", () => {
      expect(buildSelection(undefined, "users", usersTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
    });

    test("Throws QueryParsingError if projection is explicitly empty []", () => {
      expect(() => buildSelection([], "users", usersTable, mockAliasMap, mockMetadata, mockDb)).toThrow(QueryParsingError);
    });

    test("Builds selection object for valid fields, including relations", () => {
      const sel = buildSelection(["name", "profile.age"], "users", usersTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users.id).toBeDefined();
      expect(sel.users.name).toBeDefined();
      expect(sel.rel_profile).toBeDefined();
      expect(sel.rel_profile.id).toBeDefined(); // Relation PK included
    });

    test("Generates JSON extraction SQL for JSON paths in selection", () => {
      const sel = buildSelection(["settings.theme"], "users", usersTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users["settings.theme"]).toBeDefined();
    });
  });

  describe("applyJoins", () => {
    const tables = [usersTable, profilesTable, postsTable, groupsTable, usersGroupsTable];
    const mockAliasMap = new Map<string, any>();
    mockAliasMap.set("profile", profilesTable);
    mockAliasMap.set("posts", postsTable);
    mockAliasMap.set("groups", groupsTable);

    const createMockQb = () => ({
      leftJoin: mock(function() { return this; })
    });

    test("Applies simple left joins", () => {
      const qb = createMockQb();
      const paths = new Set(["profile", "posts"]);
      applyJoins(qb, paths, tables, mockMetadata, "users", usersTable, mockAliasMap, {});
      expect(qb.leftJoin).toHaveBeenCalledTimes(2);
    });

    test("Applies many-to-many joins with bridge table", () => {
      const qb = createMockQb();
      const paths = new Set(["groups"]);
      applyJoins(qb, paths, tables, mockMetadata, "users", usersTable, mockAliasMap, {});
      // One join for bridge, one for target = 2 joins
      expect(qb.leftJoin).toHaveBeenCalledTimes(2);
    });

    test("Applies soft delete filters to joined tables", () => {
      const qb = createMockQb();
      const paths = new Set(["profile"]);
      const resolvedSoftDelete = {
        profiles: { delete: { age: 100 } }
      };
      applyJoins(qb, paths, tables, mockMetadata, "users", usersTable, mockAliasMap, resolvedSoftDelete);
      expect(qb.leftJoin).toHaveBeenCalled();
    });

    test("Throws AliasNotFoundError if parent alias is missing", () => {
      const qb = createMockQb();
      const nestedMetadata = {
        ...mockMetadata,
        profiles: {
          ...mockMetadata.profiles,
          oneToOne: [{ relationName: "user", relatedTable: "users", localKey: "profiles.userId", foreignKey: "users.id" }]
        }
      };
      let paths = new Set(["profile.user"]); 
      const partialAliasMap = new Map();
      // "profile.user" is in the map, but its parent "profile" is NOT.
      partialAliasMap.set("profile.user", usersTable);
      
      expect(() => applyJoins(qb, paths, tables, nestedMetadata, "users", usersTable, partialAliasMap, {})).toThrow(AliasNotFoundError);

      
      paths = new Set(["posts.comments"]); // "posts" is missing from current level or alias map
      expect(() => applyJoins(qb, paths, tables, mockMetadata, "users", usersTable, new Map(), {})).toThrow(QueryParsingError);
    });
  });

  describe("parseFilter", () => {
    const mockAliasMap = new Map();
    test("Parses $and, $or, $not conjunctions", () => {
      expect(parseFilter({ $and: [{ name: { $eq: "A" } }] }, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeDefined();
      expect(parseFilter({ $or: [{ name: { $eq: "A" } }] }, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeDefined();
      expect(parseFilter({ $not: { name: { $eq: "A" } } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeDefined();
    });

    test("Returns undefined for empty filter", () => {
      expect(parseFilter({}, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeUndefined();
    });
    
    test("Parses flat field filters", () => {
      const f = parseFilter({ name: { $eq: "John" } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });
  });

  describe("parseOrder", () => {
    const mockAliasMap = new Map();
    test("Parses simple asc/desc order", () => {
      const orders = parseOrder({ name: "asc", id: "desc" }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(orders.length).toBe(2);
    });

    test("Parses order with nulls position", () => {
      const orders = parseOrder({ name: { direction: "asc", nulls: "first" } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(orders.length).toBe(1);
    });

    test("Parses order with whitelisted aggregate functions", () => {
      const orders = parseOrder({ id: { aggregate: "max" } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(orders.length).toBe(1);
    });

    test("Throws SecurityError for non-whitelisted aggregate functions", () => {
      expect(() => parseOrder({ id: { aggregate: "DROP TABLE" } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toThrow(SecurityError);
    });
  });
});
