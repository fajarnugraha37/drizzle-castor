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

    test("Throws for unknown $ operators (debugging typos)", () => {
      expect(() => buildFieldOperator(mockColumn, "$unknownOp", "val", mockDb)).toThrow(QueryParsingError);
      expect(() => buildFieldOperator(mockColumn, "$unknownOp", "val", mockDb)).toThrow(/Unknown operator/);
    });

    test("Returns undefined for unknown non-$ operators (fail-silent)", () => {
      expect(buildFieldOperator(mockColumn, "unknown", "val", mockDb)).toBeUndefined();
    });

    test("Builds basic comparison operators", () => {
      expect(buildFieldOperator(mockColumn, "$eq", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$ne", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$gt", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$gte", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$lt", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$lte", 1, mockDb)).toBeDefined();
    });

    test("Builds nullability operators", () => {
      expect(buildFieldOperator(mockColumn, "$isNull", true, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$isNull", false, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notIsNull", true, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notIsNull", false, mockDb)).toBeDefined();
    });

    test("Builds inArray and notInArray operators only if value is a non-empty array", () => {
      expect(buildFieldOperator(mockColumn, "$inArray", [], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$inArray", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$in", [1], mockDb)).toBeDefined();
      
      expect(buildFieldOperator(mockColumn, "$notInArray", [], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$notInArray", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notIn", [1], mockDb)).toBeDefined();
    });

    test("Builds $between and $notBetween operators only if value is a 2-element array", () => {
      expect(buildFieldOperator(mockColumn, "$between", [1], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$between", [1, 2], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notBetween", [1], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$notBetween", [1, 2], mockDb)).toBeDefined();
    });

    test("Builds like and ilike operators", () => {
      expect(buildFieldOperator(mockColumn, "$like", "val", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$ilike", "val", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notLike", "val", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notIlike", "val", mockDb)).toBeDefined();
    });

    test("Handles $ilike correctly across dialects", () => {
      const pgDb = { dialect: { escapeParam: (i: number) => `$${i + 1}` } } as any;
      const sqliteDb = { dialect: { escapeName: (n: string) => `"${n}"` } } as any;
      
      expect(buildFieldOperator(mockColumn, "$ilike", "val", pgDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$ilike", "val", sqliteDb)).toBeDefined();
    });

    test("Builds array utility operators", () => {
      expect(buildFieldOperator(mockColumn, "$arrayContains", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$arrayContains", "not-array", mockDb)).toBeUndefined();
      
      expect(buildFieldOperator(mockColumn, "$arrayContained", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$arrayContained", "not-array", mockDb)).toBeUndefined();
      
      expect(buildFieldOperator(mockColumn, "$arrayOverlaps", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$arrayOverlaps", "not-array", mockDb)).toBeUndefined();
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

    test("Wraps multiple conditions in OR", () => {
      const conds = [{ a: 1 } as any, { b: 2 } as any];
      expect(buildConjunction("$or", conds)).toBeDefined();
    });

    test("Wraps condition in NOT", () => {
      const cond = { dummy: true } as any;
      expect(buildConjunction("$not", [cond])).toBeDefined();
      expect(buildConjunction("$not", [undefined])).toBeUndefined();
    });

    test("Returns undefined for unknown conjunction types", () => {
      // @ts-ignore
      expect(buildConjunction("$unknown", [{ a: 1 }])).toBeUndefined();
    });
  });
});
