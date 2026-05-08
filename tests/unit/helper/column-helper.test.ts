import { expect, test, describe } from "bun:test";
import { getPrimaryKeyColumnName } from "../../../src/helper/column-helper";

const COLUMNS = Symbol.for("drizzle:Columns");

describe("column-helper", () => {
  describe("getPrimaryKeyColumnName", () => {
    test("should return the explicitly marked primary key column", () => {
      const mockTable = {
        [COLUMNS]: {
          uuid: { primary: true },
          name: { primary: false },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("uuid");
    });

    test("should fallback to 'id' if no primary key is explicitly marked", () => {
      const mockTable = {
        [COLUMNS]: {
          uuid: { primary: false },
          name: { primary: false },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should fallback to 'id' if columns object is empty", () => {
      const mockTable = { [COLUMNS]: {} };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should fallback to 'id' if no columns are defined", () => {
      const mockTable = {};
      expect(getPrimaryKeyColumnName(mockTable)).toBe("id");
    });

    test("should return the first primary key found if multiple exist", () => {
      const mockTable = {
        [COLUMNS]: {
          first_pk: { primary: true },
          second_pk: { primary: true },
        },
      };
      expect(getPrimaryKeyColumnName(mockTable)).toBe("first_pk");
    });
  });
});
