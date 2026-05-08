import { expect, test, describe } from "bun:test";
import { assertSafeKey } from "../../../src/query-parser/security";
import { SecurityError } from "../../../src/errors";

describe("Query Parser: Security", () => {
  describe("assertSafeKey", () => {
    test("Throws SecurityError for __proto__", () => {
      expect(() => assertSafeKey("__proto__", "test")).toThrow(SecurityError);
      expect(() => assertSafeKey("__proto__", "test")).toThrow(/__proto__/);
    });

    test("Throws SecurityError for constructor", () => {
      expect(() => assertSafeKey("constructor", "test")).toThrow(SecurityError);
      expect(() => assertSafeKey("constructor", "test")).toThrow(/constructor/);
    });

    test("Throws SecurityError for prototype", () => {
      expect(() => assertSafeKey("prototype", "test")).toThrow(SecurityError);
      expect(() => assertSafeKey("prototype", "test")).toThrow(/prototype/);
    });

    test("Allows standard keys", () => {
      expect(() => assertSafeKey("id", "test")).not.toThrow();
      expect(() => assertSafeKey("name", "test")).not.toThrow();
      expect(() => assertSafeKey("settings", "test")).not.toThrow();
      expect(() => assertSafeKey("createdAt", "test")).not.toThrow();
    });
  });
});