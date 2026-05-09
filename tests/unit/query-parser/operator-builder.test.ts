import { expect, test, describe } from "bun:test";
import { buildFieldOperator, buildConjunction } from "../../../src/query-parser/operator-builder";
import { sql } from "drizzle-orm";

describe("Query Parser: Operator Builder", () => {
  const mockColumn: any = sql`mock_column`;
  const mockDb = { dialect: { constructor: { name: "PgDialect" } } };
  const mockSqliteDb = { dialect: { constructor: { name: "SQLiteDialect" } } };

  describe("buildFieldOperator", () => {
    test("Returns undefined for undefined value", () => {
      expect(buildFieldOperator(mockColumn, "$eq", undefined, mockDb)).toBeUndefined();
    });

    test("Throws for unknown operators", () => {
      expect(() => buildFieldOperator(mockColumn, "$unknownOp", "val", mockDb)).toThrow();
    });

    test("Builds $eq operator", () => {
      const op = buildFieldOperator(mockColumn, "$eq", "val", mockDb);
      expect(op).toBeDefined();
    });

    test("Builds $inArray operator only if value is a non-empty array", () => {
      expect(buildFieldOperator(mockColumn, "$inArray", [], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$inArray", "not_array", mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$inArray", [1, 2], mockDb)).toBeDefined();
    });

    test("Builds $between operator only if value is a 2-element array", () => {
      expect(buildFieldOperator(mockColumn, "$between", [1], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$between", [1, 2, 3], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$between", [1, 2], mockDb)).toBeDefined();
    });

    test("Handles $ilike correctly across dialects", () => {
      // Drizzle's ilike / like return SQL objects. We just ensure they don't crash and return defined objects.
      const pgIlike = buildFieldOperator(mockColumn, "$ilike", "%val%", mockDb);
      expect(pgIlike).toBeDefined();

      const sqliteIlike = buildFieldOperator(mockColumn, "$ilike", "%val%", mockSqliteDb);
      expect(sqliteIlike).toBeDefined();
    });

    test("Builds $eq, $ne, $gt, $gte, $lt, $lte operators", () => {
      expect(buildFieldOperator(mockColumn, "$eq", "v", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$ne", "v", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$gt", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$gte", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$lt", 1, mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$lte", 1, mockDb)).toBeDefined();
    });

    test("Handles $isNull dynamically based on boolean value", () => {
      const isNullOp = buildFieldOperator(mockColumn, "$isNull", true, mockDb);
      expect(isNullOp).toBeDefined();

      const isNotNullOp = buildFieldOperator(mockColumn, "$isNull", false, mockDb);
      expect(isNotNullOp).toBeDefined(); // Actually returns isNotNull(column) internally
    });

    test("Handles $notIsNull dynamically based on boolean value", () => {
      const isNotNullOp = buildFieldOperator(mockColumn, "$notIsNull", true, mockDb);
      expect(isNotNullOp).toBeDefined();

      const isNullOp = buildFieldOperator(mockColumn, "$notIsNull", false, mockDb);
      expect(isNullOp).toBeDefined();
    });

    test("Builds $inArray and $notInArray operators", () => {
      expect(buildFieldOperator(mockColumn, "$in", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$inArray", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notIn", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notInArray", [1], mockDb)).toBeDefined();
      
      expect(buildFieldOperator(mockColumn, "$notIn", [], mockDb)).toBeUndefined();
      expect(buildFieldOperator(mockColumn, "$notIn", "not_array", mockDb)).toBeUndefined();
    });

    test("Builds $between and $notBetween operators", () => {
      expect(buildFieldOperator(mockColumn, "$between", [1, 2], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notBetween", [1, 2], mockDb)).toBeDefined();
      
      expect(buildFieldOperator(mockColumn, "$notBetween", [1], mockDb)).toBeUndefined();
    });

    test("Handles $like and $notLike", () => {
      expect(buildFieldOperator(mockColumn, "$like", "%v%", mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$notLike", "%v%", mockDb)).toBeDefined();
    });

    test("Handles $ilike and $notIlike correctly across dialects", () => {
      // Drizzle's ilike / like return SQL objects. We just ensure they don't crash and return defined objects.
      const pgIlike = buildFieldOperator(mockColumn, "$ilike", "%val%", mockDb);
      expect(pgIlike).toBeDefined();

      const sqliteIlike = buildFieldOperator(mockColumn, "$ilike", "%val%", mockSqliteDb);
      expect(sqliteIlike).toBeDefined();

      const pgNotIlike = buildFieldOperator(mockColumn, "$notIlike", "%val%", mockDb);
      expect(pgNotIlike).toBeDefined();

      const sqliteNotIlike = buildFieldOperator(mockColumn, "$notIlike", "%val%", mockSqliteDb);
      expect(sqliteNotIlike).toBeDefined();
    });

    test("Handles array operators ($arrayContains, $arrayContained, $arrayOverlaps)", () => {
      expect(buildFieldOperator(mockColumn, "$arrayContains", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$arrayContained", [1], mockDb)).toBeDefined();
      expect(buildFieldOperator(mockColumn, "$arrayOverlaps", [1], mockDb)).toBeDefined();
      
      expect(buildFieldOperator(mockColumn, "$arrayContains", "not_array", mockDb)).toBeUndefined();
    });
  });

  describe("buildConjunction", () => {
    const c1: any = sql`cond1`;
    const c2: any = sql`cond2`;

    test("Returns undefined if array is empty", () => {
      expect(buildConjunction("$and", [])).toBeUndefined();
    });

    test("Returns undefined if all conditions in array are undefined", () => {
      expect(buildConjunction("$and", [undefined, undefined])).toBeUndefined();
    });

    test("Returns single condition directly without wrapping", () => {
      const res = buildConjunction("$and", [undefined, c1]);
      expect(res).toBe(c1);
    });

    test("Wraps multiple conditions in AND", () => {
      const res = buildConjunction("$and", [c1, c2]);
      expect(res).toBeDefined();
      expect(res).not.toBe(c1);
    });

    test("Wraps multiple conditions in OR", () => {
      const res = buildConjunction("$or", [c1, c2]);
      expect(res).toBeDefined();
    });

    test("Wraps condition in NOT", () => {
      const res = buildConjunction("$not", [c1]);
      expect(res).toBeDefined();
    });
  });
});