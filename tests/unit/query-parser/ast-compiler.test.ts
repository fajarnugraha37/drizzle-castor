import { expect, test, describe, mock } from "bun:test";
import { buildSelection, parseFilter, parseOrder, applyJoins } from "../../../src/query-parser/ast-compiler";
import { SecurityError, AliasNotFoundError, TableNotFoundError, ColumnNotFoundError } from "../../../src/errors";
import { pgTable, serial, text, json } from "drizzle-orm/pg-core";

describe("Query Parser: AST Compiler", () => {
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

    test("Returns undefined if projection is empty and throws for empty array", () => {
      expect(() => buildSelection([], "users", usersTable, mockAliasMap, mockMetadata, mockDb)).toThrow();
      expect(buildSelection(undefined, "users", usersTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
    });

    test("Builds selection object for valid fields, including relations", () => {
      const sel = buildSelection(["name", "profile.age"], "users", usersTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users.id).toBeDefined();
      expect(sel.users.name).toBeDefined();
      expect(sel.rel_profile).toBeDefined();
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
  });

  describe("parseFilter", () => {
    const mockAliasMap = new Map();
    test("Parses $not operator with valid condition", () => {
      const f = parseFilter({ $not: { name: { $eq: "John" } } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });

    test("Returns undefined for empty filter", () => {
      expect(parseFilter({}, usersTable, mockAliasMap, mockMetadata, "users", mockDb)).toBeUndefined();
    });
    
    test("Parses flat field filters", () => {
      const f = parseFilter({ name: { $eq: "John" } }, usersTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(f).toBeDefined();
    });
  });
});
