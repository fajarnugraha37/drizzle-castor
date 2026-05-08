import { expect, test, describe } from "bun:test";
import { getSoftDeleteConfig } from "../../../src/helper/config-helper";
import { ConfigurationError } from "../../../src/errors";

describe("config-helper", () => {
  describe("getSoftDeleteConfig", () => {
    test("should return soft delete config when available", () => {
      const metadata = {
        users: {
          softDelete: {
            column: "deleted_at",
            type: "timestamp",
          },
        },
      };
      expect(getSoftDeleteConfig(metadata, "users")).toEqual({
        column: "deleted_at",
        type: "timestamp",
      });
    });

    test("should throw ConfigurationError when softDelete is not defined for table", () => {
      const metadata = {
        users: {},
      };
      expect(() => getSoftDeleteConfig(metadata, "users")).toThrow(
        ConfigurationError
      );
      expect(() => getSoftDeleteConfig(metadata, "users")).toThrow(
        "Soft delete is not configured for table 'users'"
      );
    });

    test("should throw ConfigurationError when table is not in metadata", () => {
      const metadata = {};
      expect(() => getSoftDeleteConfig(metadata, "users")).toThrow(
        ConfigurationError
      );
      expect(() => getSoftDeleteConfig(metadata, "users")).toThrow(
        "Soft delete is not configured for table 'users'"
      );
    });

    test("should throw TypeError when metadata is undefined", () => {
      expect(() => getSoftDeleteConfig(undefined as any, "users")).toThrow(
        TypeError
      );
    });

    test("should throw TypeError when metadata is null", () => {
      expect(() => getSoftDeleteConfig(null as any, "users")).toThrow(
        TypeError
      );
    });
  });
});
