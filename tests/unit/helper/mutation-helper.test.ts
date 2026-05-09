import { expect, test, describe } from "bun:test";
import { isMutated } from "../../../src/helper/mutation-helper";

describe("Mutation Helper: isMutated", () => {
  describe("Array Results (Returning IDs)", () => {
    test("should return true for non-empty array", () => {
      expect(isMutated([1])).toBe(true);
      expect(isMutated([{ id: 100 }])).toBe(true);
      expect(isMutated(["uuid-string"])).toBe(true);
    });

    test("should return false for empty array", () => {
      expect(isMutated([])).toBe(false);
    });
  });

  describe("Numeric Results (Row Counts)", () => {
    test("should return true for positive integers", () => {
      expect(isMutated(1)).toBe(true);
      expect(isMutated(100)).toBe(true);
    });

    test("should return false for zero", () => {
      expect(isMutated(0)).toBe(false);
    });

    test("should return false for negative numbers (e.g. fallback -1)", () => {
      expect(isMutated(-1)).toBe(false);
    });
  });

  describe("Invalid or Edge Case Truthy Values", () => {
    test("should return false for null or undefined", () => {
      expect(isMutated(null)).toBe(false);
      expect(isMutated(undefined)).toBe(false);
    });

    test("should return false for empty objects", () => {
      // @ts-ignore
      expect(isMutated({})).toBe(false);
    });

    test("should return false for boolean values", () => {
      // @ts-ignore
      expect(isMutated(true)).toBe(false);
      // @ts-ignore
      expect(isMutated(false)).toBe(false);
    });

    test("should return false for strings", () => {
      // @ts-ignore
      expect(isMutated("success")).toBe(false);
      // @ts-ignore
      expect(isMutated("")).toBe(false);
    });
  });
});
