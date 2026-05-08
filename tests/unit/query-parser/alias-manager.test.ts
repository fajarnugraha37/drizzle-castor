import { expect, test, describe } from "bun:test";
import { generateAliasName, buildAliases } from "../../../src/query-parser/alias-manager";
import { TableNotFoundError } from "../../../src/errors";

describe("Query Parser: Alias Manager", () => {
  describe("generateAliasName", () => {
    test("Replaces dots with underscores", () => {
      expect(generateAliasName("posts.comments")).toBe("rel_posts_comments");
    });
  });

  describe("buildAliases", () => {
    const mockTables = [
      { [Symbol.for("drizzle:Name")]: "posts" } as any,
    ];
    const mockMetadata = {
      users: { oneToMany: [{ relationName: "posts", relatedTable: "posts" }] }
    };

    test("Builds alias map successfully", () => {
      const paths = new Set(["posts"]);
      const map = buildAliases(paths, mockTables, mockMetadata, "users");
      expect(map.size).toBe(1);
      expect(map.has("posts")).toBe(true);
    });

    test("Throws TableNotFoundError if related table not in array", () => {
      const paths = new Set(["unknown"]);
      const badMetadata = { users: { oneToOne: [{ relationName: "unknown", relatedTable: "missing_table" }] }};
      expect(() => buildAliases(paths, mockTables, badMetadata, "users")).toThrow(TableNotFoundError);
    });
  });
});
