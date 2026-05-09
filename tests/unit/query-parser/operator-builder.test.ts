import { expect, test, describe, mock } from "bun:test";
import { buildFieldOperator, buildConjunction } from "../../../src/query-parser/operator-builder";
import { QueryParsingError } from "../../../src/errors";

describe("Query Parser: Operator Builder", () => {
  const mockColumn = { name: "id" } as any;
  const mockDb = { dialect: { escapeParam: () => "?" } } as any;

  describe("buildFieldOperator", () => {
    test("Returns undefined for undefined value", () => {
      expect(buildFieldOperator(mockColumn, "$eq", undefined, mockDb)).toBeUndefined();
    });

    test("Throws for unknown operators", () => {
      expect(() => buildFieldOperator(mockColumn, "$unknownOp", "val", mockDb)).toThrow(QueryParsingError);
    });

    test("Builds $eq operator", () => {
      const op = buildFieldOperator(mockColumn, "$eq", 1, mockDb);
      expect(op).toBeDefined();
    });

    test("Builds $inArray operator only if value is a non-empty array", () => {
      expect(buildFieldOperator(mockColumn, "$inArray", [], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$inArray", [1], mockDb)).toBeDefined();
    });

    test("Builds $between operator only if value is a 2-element array", () => {
      expect(buildFieldOperator(mockColumn, "$between", [1], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$between", [1, 2], mockDb)).toBeDefined();
    });

    test("Handles $ilike correctly across dialects", () => {
      const pgDb = { dialect: { escapeParam: (i: number) => `$${i + 1}` } } as any;
      const sqliteDb = { dialect: { escapeName: (n: string) => `"${n}"` } } as any;
      
      expect(buildFieldOperator(mockColumn, "$ilike", "val", pgDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$ilike", "val", sqliteDb)).toBeDefined();
    });
  });

  describe("buildConjunction", () => {
    test("Returns undefined if array is empty", () => {
      expect(buildConjunction("$and", [])).toBeUndefined();
    });

    test("Returns undefined if all conditions in array are undefined", () => {
      expect(buildConjunction("$and", [undefined, undefined])).toBeUndefined();
    });

    test("Returns single condition directly without wrapping", () => {
      const cond = { dummy: true } as any;
      expect(buildConjunction("$and", [cond])).toBe(cond);
    });

    test("Wraps multiple conditions in AND", () => {
      const conds = [{ a: 1 } as any, { b: 2 } as any];
      expect(buildConjunction("$and", conds)).toBeDefined();
    });

    test("Wraps condition in NOT", () => {
      const cond = { dummy: true } as any;
      expect(buildConjunction("$not", [cond])).toBeDefined();
    });
  });
});
