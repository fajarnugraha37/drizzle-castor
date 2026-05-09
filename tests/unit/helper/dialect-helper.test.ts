import { expect, test, describe, mock } from "bun:test";
import {
  getDialect,
  supportsReturning,
  generateTempTableName,
  getPrimaryKeyPropertyNames,
  getTempTableCount,
} from "../../../src/helper/dialect-helper";
import { pgTable, serial, primaryKey } from "drizzle-orm/pg-core";

describe("dialect-helper", () => {
  describe("getDialect", () => {
    test("should return 'pg' for Postgres-like dialect", () => {
      const db = { 
        dialect: { 
          escapeParam: (i: number) => `$${i + 1}`
        } 
      };
      expect(getDialect(db)).toBe("pg");
    });

    test("should return 'mysql' for MySQL-like dialect", () => {
      const db = { 
        dialect: { 
          escapeName: (n: string) => `\`${n}\``
        } 
      };
      expect(getDialect(db)).toBe("mysql");
    });

    test("should return 'sqlite' for SQLiteDialect", () => {
      const db = { dialect: { constructor: { name: "SQLiteDialect" } } };
      expect(getDialect(db)).toBe("sqlite");
    });

    test("should return 'sqlite' for LibsqlDialect", () => {
      const db = { dialect: { constructor: { name: "LibsqlDialect" } } };
      expect(getDialect(db)).toBe("sqlite");
    });

    test("should return 'sqlite' for unknown dialect", () => {
      const db = { dialect: { constructor: { name: "OracleDialect" } } };
      expect(getDialect(db)).toBe("sqlite");
    });
    
    test("should return true for unknown dialect (defaults to sqlite)", () => {
      const db = { dialect: { constructor: { name: "UnknownDialect" } } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return true when db is null (defaults to sqlite)", () => {
      expect(supportsReturning(null)).toBe(true);
    });

    test("should return 'sqlite' for SQLite-like dialect (fallback)", () => {
      const db = { 
        dialect: { 
          escapeName: (n: string) => `"${n}"`,
          escapeParam: () => `?`
        } 
      };
      expect(getDialect(db)).toBe("sqlite");
    });

    test("should return 'sqlite' when db or dialect is missing", () => {
      expect(getDialect({})).toBe("sqlite");
      expect(getDialect(null)).toBe("sqlite");
      expect(getDialect(undefined)).toBe("sqlite");
      expect(getDialect({ dialect: null })).toBe("sqlite");
      expect(getDialect({ dialect: {} })).toBe("sqlite");
    });
  });

  describe("supportsReturning", () => {
    test("should return true for pg", () => {
      const db = { dialect: { escapeParam: (i: number) => `$${i + 1}` } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return true for sqlite", () => {
      const db = { dialect: { escapeParam: () => "?" } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return false for mysql", () => {
      const db = { dialect: { escapeName: (n: string) => `\`${n}\`` } };
      expect(supportsReturning(db)).toBe(false);
    });
  });

  describe("getTempTableCount", () => {
    test("should handle MySQL (mysql2) result format [rows, fields]", async () => {
      const tx = {
        dialect: { escapeName: (n: string) => `\`${n}\`` },
        execute: mock(async () => [[{ count: 5 }], []])
      };
      const count = await getTempTableCount(tx, "tmp");
      expect(count).toBe(5);
    });

    test("should handle Postgres (node-postgres) result format {rows: []}", async () => {
      const tx = {
        dialect: { escapeParam: (i: number) => `$${i + 1}` },
        execute: mock(async () => ({ rows: [{ count: 10 }] }))
      };
      const count = await getTempTableCount(tx, "tmp");
      expect(count).toBe(10);
    });

    test("should handle Postgres (postgres.js) result format (array directly)", async () => {
      const tx = {
        dialect: { escapeParam: (i: number) => `$${i + 1}` },
        execute: mock(async () => [{ count: 15 }])
      };
      const count = await getTempTableCount(tx, "tmp");
      expect(count).toBe(15);
    });

    test("should handle SQLite result format (array directly)", async () => {
      const tx = {
        dialect: { escapeParam: () => "?" },
        execute: mock(async () => [{ count: 20 }])
      };
      const count = await getTempTableCount(tx, "tmp");
      expect(count).toBe(20);
    });

    test("should return 0 for empty results", async () => {
      const tx = {
        dialect: { escapeParam: () => "?" },
        execute: mock(async () => [])
      };
      const count = await getTempTableCount(tx, "tmp");
      expect(count).toBe(0);
    });
  });

  describe("getPrimaryKeyPropertyNames", () => {
    test("should find column-level primary keys", () => {
      const testTable = pgTable("test_col_pk", {
        uuid: serial("uuid").primaryKey(),
      });
      
      const pks = getPrimaryKeyPropertyNames(testTable);
      expect(pks).toEqual(["uuid"]);
    });

    test("should find table-level primary keys", () => {
      const testTable = pgTable("test_table_pk", {
        id: serial("id"),
      }, (table) => ({
        pk: primaryKey({ columns: [table.id] }),
      }));

      const pks = getPrimaryKeyPropertyNames(testTable);
      expect(pks).toEqual(["id"]);
    });

    test("should find composite primary keys", () => {
      const testTable = pgTable("test_composite_pk", {
        tenantId: serial("tenant_id"),
        userId: serial("user_id"),
      }, (table) => ({
        pk: primaryKey({ columns: [table.tenantId, table.userId] }),
      }));

      const pks = getPrimaryKeyPropertyNames(testTable);
      expect(pks.sort()).toEqual(["tenantId", "userId"].sort());
    });
  });

  test("should return empty if no primary key found", () => {
    const testTable = pgTable("test_no_pk", {
      name: serial("name"),
    });

    const pks = getPrimaryKeyPropertyNames(testTable);
    expect(pks).toEqual([]);
  });

  describe("generateTempTableName", () => {
    test("should return a unique valid temporary table name", () => {
      const name1 = generateTempTableName();
      const name2 = generateTempTableName();
      expect(name1.startsWith("_tmp_castor_")).toBe(true);
      expect(name1).not.toBe(name2);
      expect(name1).not.toContain(".");
    });
  });

  describe("generateTempTableName", () => {
    test("should return a valid temporary table name", () => {
      const name = generateTempTableName();
      expect(name.startsWith("_tmp_castor_")).toBe(true);
      expect(name.length).toBeGreaterThan("_tmp_castor_".length);
    });
  });

  test("should return unique names on subsequent calls", () => {
    const name1 = generateTempTableName();
    const name2 = generateTempTableName();
    expect(name1).not.toBe(name2);
  });

  test("should not contain dots", () => {
    const name = generateTempTableName();
    expect(name).not.toContain(".");
  });
});
