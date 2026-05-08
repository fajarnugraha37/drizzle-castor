import { expect, test, describe } from "bun:test";
import { isCastorError, isSecurityError, isQueryError, getErrorMessage } from "./utils";
import { CastorError } from "./base";
import { SecurityError, AccessDeniedError } from "./security";
import { QueryParsingError, TableNotFoundError, ColumnNotFoundError, RelationNotFoundError, AliasNotFoundError } from "./query";
import { ConfigurationError } from "./config";
import { MutationError } from "./mutation";

describe("Error Utilities", () => {
  describe("isCastorError", () => {
    test("Identifies standard CastorError instances", () => {
      const err = new CastorError("test", "MUTATION_ERROR");
      expect(isCastorError(err)).toBe(true);
    });

    test("Identifies child class instances", () => {
      const err = new ConfigurationError("test");
      expect(isCastorError(err)).toBe(true);
    });

    test("Identifies bundled objects mimicking CastorError (duck typing)", () => {
      const fakeErr = { name: "SomeError", code: "ANY_CODE", message: "msg" };
      expect(isCastorError(fakeErr)).toBe(true);
    });

    test("Rejects standard JS Error", () => {
      const err = new Error("test");
      expect(isCastorError(err)).toBe(false);
    });

    test("Rejects null/undefined/primitive types", () => {
      expect(isCastorError(null)).toBe(false);
      expect(isCastorError(undefined)).toBe(false);
      expect(isCastorError("string error")).toBe(false);
      expect(isCastorError(123)).toBe(false);
    });
  });

  describe("isSecurityError", () => {
    test("Identifies SecurityError", () => {
      const err = new SecurityError("test");
      expect(isSecurityError(err)).toBe(true);
    });

    test("Identifies AccessDeniedError", () => {
      const err = new AccessDeniedError("test");
      expect(isSecurityError(err)).toBe(true);
    });

    test("Identifies duck-typed security error", () => {
      const fakeErr = { name: "MockError", code: "ACCESS_DENIED", message: "msg" };
      expect(isSecurityError(fakeErr)).toBe(true);
    });

    test("Rejects other CastorError types", () => {
      const err = new ConfigurationError("test");
      expect(isSecurityError(err)).toBe(false);
    });

    test("Rejects standard JS Error", () => {
      const err = new Error("test");
      expect(isSecurityError(err)).toBe(false);
    });
  });

  describe("isQueryError", () => {
    test("Identifies QueryParsingError", () => {
      const err = new QueryParsingError("test");
      expect(isQueryError(err)).toBe(true);
    });

    test("Identifies TableNotFoundError", () => {
      const err = new TableNotFoundError("test");
      expect(isQueryError(err)).toBe(true);
    });

    test("Identifies ColumnNotFoundError", () => {
      const err = new ColumnNotFoundError("test");
      expect(isQueryError(err)).toBe(true);
    });

    test("Identifies RelationNotFoundError", () => {
      const err = new RelationNotFoundError("test");
      expect(isQueryError(err)).toBe(true);
    });

    test("Identifies AliasNotFoundError", () => {
      const err = new AliasNotFoundError("test");
      expect(isQueryError(err)).toBe(true);
    });

    test('Identifies MutationError when code is "MUTATION_ERROR"', () => {
      const err = new MutationError("test", "test mutation error");
      expect(isCastorError(err)).toBe(true);
      expect(err.code).toBe("MUTATION_ERROR");
    });

    test("Identifies bundled objects mimicking QueryError (duck typing)", () => {
      const fakeErr = { name: "MockError", code: "COLUMN_NOT_FOUND", message: "msg" };
      expect(isQueryError(fakeErr)).toBe(true);
    });

    test("Identifies bundled objects mimicking QueryError with different code (duck typing)", () => {
      const fakeErr = { name: "MockError", code: "TABLE_NOT_FOUND", message: "msg" };
      expect(isQueryError(fakeErr)).toBe(true);
    });

    test("Identifies duck-typed query parsing error", () => {
      const fakeErr = { name: "MockError", code: "COLUMN_NOT_FOUND", message: "msg" };
      expect(isQueryError(fakeErr)).toBe(true);
    });

    test("Rejects other CastorError types", () => {
      const err = new AccessDeniedError("test");
      expect(isQueryError(err)).toBe(false);
    });

    test("Rejects standard JS Error", () => {
      const err = new Error("test");
      expect(isQueryError(err)).toBe(false);
    });
  });

  describe("getErrorMessage", () => {
    test("Extracts message from Error instance", () => {
      const err = new Error("Built-in error message");
      expect(getErrorMessage(err)).toBe("Built-in error message");
    });

    test("Extracts message from CastorError instance", () => {
      const err = new ConfigurationError("Config error message");
      expect(getErrorMessage(err)).toBe("Config error message");
    });

    test("Returns string as-is when thrown as string", () => {
      expect(getErrorMessage("Just a string")).toBe("Just a string");
    });

    test("Returns default message for unknown objects or null", () => {
      expect(getErrorMessage({ unknown: true })).toBe("An unknown error occurred");
      expect(getErrorMessage(null)).toBe("An unknown error occurred");
      expect(getErrorMessage(undefined)).toBe("An unknown error occurred");
      expect(getErrorMessage(123)).toBe("An unknown error occurred");
    });
  });
});