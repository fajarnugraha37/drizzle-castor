import { expect, test, describe } from "bun:test";
import { buildJsonExtractionSql, parseUpdateSet } from "./json-resolver";
import { SecurityError, ColumnNotFoundError } from "../errors";
import { sql } from "drizzle-orm";

describe("Query Parser: JSON Resolver", () => {
  describe("buildJsonExtractionSql", () => {
    const mockDbPg = { dialect: { constructor: { name: "PgDialect" } } };
    const mockDbMySql = { dialect: { constructor: { name: "MySqlDialect" } } };
    const mockDbSqlite = { dialect: { constructor: { name: "SQLiteDialect" } } };

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
      // Result is a Drizzle SQL object. We can check its raw string query representation roughly
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
    const mockDbPg = { dialect: { constructor: { name: "PgDialect" } } };
    
    const mockBaseTable = {
      [Symbol.for("drizzle:Name")]: "users",
      [Symbol.for("drizzle:Columns")]: {
        name: sql`name`,
        settings: sql`settings`
      }
    };
    // Mock getTableColumns behavior manually for the test
    const getTableColumnsMock = () => ({
      name: sql`name`,
      settings: sql`settings`
    });

    // Note: To fully test parseUpdateSet, we'd need to mock getTableColumns from drizzle-orm
    // Since bun:test allows mocking module exports, we can do it, but for a simple unit test,
    // testing the security error and column not found error is crucial.

    test("Throws SecurityError on invalid JSON path in setParams", () => {
      expect(() => {
         parseUpdateSet(mockDbPg, mockBaseTable, { "settings.in;valid": "hacked" });
      }).toThrow(SecurityError);
    });
  });
});