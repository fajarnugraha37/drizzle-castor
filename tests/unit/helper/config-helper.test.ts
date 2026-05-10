import { expect, test, describe } from "bun:test";
import { getSoftDeleteConfig, getTableMetadataConfig } from "../../../src/helper/config-helper";
import { ConfigurationError } from "../../../src/errors";

describe("config-helper", () => {
  describe("getTableMetadataConfig", () => {
    test("should return table config when available", () => {
      const translatorContext = {
        metadata: {
          users: { some: "config" },
        },
      } as any;
      expect(getTableMetadataConfig(translatorContext, "users")).toEqual({
        some: "config",
      });
    });

    test("should return undefined when table is not in metadata", () => {
      const translatorContext = {
        metadata: {},
      } as any;
      expect(getTableMetadataConfig(translatorContext, "users")).toBeUndefined();
    });

    test("should return undefined when metadata is missing", () => {
      const translatorContext = {} as any;
      expect(getTableMetadataConfig(translatorContext, "users")).toBeUndefined();
    });
  });

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
