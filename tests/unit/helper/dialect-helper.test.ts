import { expect, test, describe } from "bun:test";
import {
  getDialect,
  supportsReturning,
  generateTempTableName,
} from "../../../src/helper/dialect-helper";

describe("dialect-helper", () => {
  describe("getDialect", () => {
    test("should return 'pg' for PgDialect", () => {
      const db = { dialect: { constructor: { name: "PgDialect" } } };
      expect(getDialect(db)).toBe("pg");
    });

    test("should return 'mysql' for MySqlDialect", () => {
      const db = { dialect: { constructor: { name: "MySqlDialect" } } };
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
      const db = { dialect: { constructor: { name: "PgDialect" } } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return true for sqlite", () => {
      const db = { dialect: { constructor: { name: "SQLiteDialect" } } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return false for mysql", () => {
      const db = { dialect: { constructor: { name: "MySqlDialect" } } };
      expect(supportsReturning(db)).toBe(false);
    });

    test("should return true for unknown dialect (defaults to sqlite)", () => {
      const db = { dialect: { constructor: { name: "UnknownDialect" } } };
      expect(supportsReturning(db)).toBe(true);
    });

    test("should return true when db is null (defaults to sqlite)", () => {
      expect(supportsReturning(null)).toBe(true);
    });
  });

  describe("generateTempTableName", () => {
    test("should return a valid temporary table name", () => {
      const name = generateTempTableName();
      expect(name.startsWith("_tmp_castor_")).toBe(true);
      expect(name.length).toBeGreaterThan("_tmp_castor_".length);
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
});
