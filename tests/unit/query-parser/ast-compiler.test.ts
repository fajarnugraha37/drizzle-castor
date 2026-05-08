import { expect, test, describe } from "bun:test";
import { buildSelection, parseFilter, parseOrder } from "../../../src/query-parser/ast-compiler";
import { SecurityError } from "../../../src/errors";
import { sql } from "drizzle-orm";

describe("Query Parser: AST Compiler", () => {
  const mockDb = { dialect: { constructor: { name: "PgDialect" } } };
  const mockBaseTable = {
    [Symbol.for("drizzle:Name")]: "users",
    [Symbol.for("drizzle:Columns")]: {
      id: sql`id`,
      name: sql`name`,
      settings: sql`settings`
    },
    id: sql`id`,
    name: sql`name`,
    settings: sql`settings`
  };
  const mockMetadata = {
    users: {
      oneToOne: [{ relationName: "profile", relatedTable: "profiles" }]
    }
  };
  const mockAliasMap = new Map<string, any>();

  describe("buildSelection", () => {
    test("Returns undefined if projection is empty", () => {
      expect(buildSelection([], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
      expect(buildSelection(undefined, "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb)).toBeUndefined();
    });

    test("Builds selection object for valid fields, always including base table ID", () => {
      const sel = buildSelection(["name"], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users.id).toBeDefined();
      expect(sel.users.name).toBeDefined();
    });

    test("Generates JSON extraction SQL for JSON paths in selection", () => {
      const sel = buildSelection(["settings.theme"], "users", mockBaseTable, mockAliasMap, mockMetadata, mockDb);
      expect(sel).toBeDefined();
      expect(sel.users["settings.theme"]).toBeDefined(); // extracted via JSON
    });
  });

  describe("parseFilter", () => {
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
    test("Returns empty array for empty order", () => {
      expect(parseOrder({}, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toEqual([]);
      expect(parseOrder(undefined, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb)).toEqual([]);
    });

    test("Parses string direction", () => {
      const o = parseOrder({ name: "desc" }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      expect(o.length).toBe(1);
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
        parseOrder({ name: { aggregate: "hacked_func" } }, mockBaseTable, mockAliasMap, mockMetadata, "users", mockDb);
      }).toThrow(SecurityError);
    });
  });
});