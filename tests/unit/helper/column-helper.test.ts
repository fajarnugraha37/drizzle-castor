import { expect, test, describe, mock } from "bun:test";
import { getPrimaryKeyColumnName } from "../../../src/helper/column-helper";

// Mock getTableColumns from drizzle-orm
mock.module("drizzle-orm", () => ({
  getTableColumns: (table: any) => table.columns || {},
}));

describe("column-helper", () => {
  describe("getPrimaryKeyColumnName", () => {
    test("should return the explicitly marked primary key column", () => {
      const mockTable = {
        columns: {
          uuid: { primary: true },
          name: { primary: false },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("uuid");
    });

    test("should fallback to 'id' if no primary key is explicitly marked", () => {
      const mockTable = {
        columns: {
          uuid: { primary: false },
          name: { primary: false },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should fallback to 'id' if columns object is empty", () => {
      const mockTable = { columns: {} };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should fallback to 'id' if no columns are defined", () => {
      const mockTable = {};
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should return the first primary key found if multiple exist", () => {
      const mockTable = {
        columns: {
          first_pk: { primary: true },
          second_pk: { primary: true },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("first_pk");
    });
  });
});
