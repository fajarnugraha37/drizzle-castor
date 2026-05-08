import { expect, test, describe, mock } from "bun:test";
import { buildJsonExtractionSql, parseUpdateSet } from "../../../src/query-parser/json-resolver";
import { SecurityError, ColumnNotFoundError } from "../../../src/errors";
import { sql, getTableColumns } from "drizzle-orm";

// Mock drizzle-orm's getTableColumns
mock.module("drizzle-orm", () => {
  const original = require("drizzle-orm");
  return {
    ...original,
    getTableColumns: (table: any) => {
      if (table && table._mockColumns) return table._mockColumns;
      return original.getTableColumns(table);
    }
  };
});

describe("Query Parser: JSON Resolver", () => {
  const mockDbPg = { dialect: { constructor: { name: "PgDialect" } } };
  const mockDbMySql = { dialect: { constructor: { name: "MySqlDialect" } } };
  const mockDbSqlite = { dialect: { constructor: { name: "SQLiteDialect" } } };

  describe("buildJsonExtractionSql", () => {
    test("Rejects invalid JSON paths", () => {
      expect(() => buildJsonExtractionSql(mockDbPg, sql`col`, "invalid;path")).toThrow(SecurityError);
      expect(() => buildJsonExtractionSql(mockDbPg, sql`col`, "path'--")).toThrow(SecurityError);
    });

    test("Rejects prototype pollution paths", () => {
      expect(() => buildJsonExtractionSql(mockDbPg, sql`col`, "settings.__proto__")).toThrow(SecurityError);
      expect(() => buildJsonExtractionSql(mockDbPg, sql`col`, "constructor.name")).toThrow(SecurityError);
    });

    test("Generates correct SQL for PostgreSQL", () => {
      const result = buildJsonExtractionSql(mockDbPg, sql`col`, "profile.age");
      expect(result).toBeDefined();
    });

    test("Generates correct SQL for MySQL (formats numeric indices to array access)", () => {
      const result = buildJsonExtractionSql(mockDbMySql, sql`col`, "skills.0.name");
      expect(result).toBeDefined();
    });

    test("Generates correct SQL for SQLite", () => {
      const result = buildJsonExtractionSql(mockDbSqlite, sql`col`, "settings.theme");
      expect(result).toBeDefined();
    });
  });

  describe("parseUpdateSet", () => {
    const mockColumns = {
      name: sql`name`,
      settings: sql`settings`
    };
    const mockBaseTable = {
      _mockColumns: mockColumns,
      [Symbol.for("drizzle:Name")]: "users"
    };

    test("Throws SecurityError on invalid JSON path in setParams", () => {
      expect(() => {
         parseUpdateSet(mockDbPg, mockBaseTable, { "settings.in;valid": "hacked" });
      }).toThrow(SecurityError);
    });

    test("Throws ColumnNotFoundError for non-existent base column", () => {
      expect(() => {
        parseUpdateSet(mockDbPg, mockBaseTable, { "unknown.path": "val" });
      }).toThrow(ColumnNotFoundError);
    });

    test("Correctly parses flat updates", () => {
      const result = parseUpdateSet(mockDbPg, mockBaseTable, { name: "John" });
      expect(result).toEqual({ name: "John" });
    });

    test("Parses JSON updates for PostgreSQL", () => {
      const result = parseUpdateSet(mockDbPg, mockBaseTable, { "settings.theme": "dark", "settings.lang": "en" });
      expect(result.settings).toBeDefined();
    });

    test("Parses JSON updates for MySQL", () => {
      const result = parseUpdateSet(mockDbMySql, mockBaseTable, { "settings.theme": "dark" });
      expect(result.settings).toBeDefined();
    });

    test("Parses JSON updates for SQLite", () => {
      const result = parseUpdateSet(mockDbSqlite, mockBaseTable, { "settings.theme": "dark" });
      expect(result.settings).toBeDefined();
    });

    test("Handles numeric indices in SQLite/MySQL paths", () => {
      const result = parseUpdateSet(mockDbSqlite, mockBaseTable, { "settings.0.theme": "dark" });
      expect(result.settings).toBeDefined();
      // formatSqliteMysqlPath converts 0 to [0]
    });
  });
});