import { expect, test, describe } from "bun:test";
import { analyzeQuery, getRelationPath } from "../../../src/query-parser/analyzer";

describe("Query Parser: Analyzer", () => {
  const mockMetadata = {
    users: {
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }],
    },
    posts: {
      oneToMany: [{ relationName: "comments", relatedTable: "comments" }],
    }
  };

  describe("getRelationPath", () => {
    test("Extracts relation path from full path", () => {
      expect(getRelationPath("posts.title", mockMetadata, "users")).toBe("posts");
      expect(getRelationPath("posts.comments.text", mockMetadata, "users")).toBe("posts.comments");
    });

    test("Returns null if no relation", () => {
      expect(getRelationPath("name", mockMetadata, "users")).toBeNull();
    });
  });

  describe("analyzeQuery", () => {
    test("Analyzes empty query", () => {
      const res = analyzeQuery({}, mockMetadata, "users");
      expect(res.ctePaths.size).toBe(0);
      expect(res.outerPaths.size).toBe(0);
      expect(res.needsGroupBy).toBe(false);
    });

    test("Extracts filters to ctePaths and adds parent paths", () => {
      const res = analyzeQuery({ filter: { "posts.comments.text": { $eq: "hi" } } }, mockMetadata, "users");
      expect(Array.from(res.ctePaths)).toEqual(["posts", "posts.comments"]);
      expect(res.needsGroupBy).toBe(false);
    });

    test("Extracts projections to outerPaths and adds parent paths", () => {
      const res = analyzeQuery({ projection: ["posts.comments.text"] }, mockMetadata, "users");
      expect(Array.from(res.outerPaths)).toEqual(["posts", "posts.comments"]);
    });

    test("Detects needsGroupBy from aggregate sort", () => {
      const res = analyzeQuery({ order: { "posts.comments.id": { aggregate: "max" } } }, mockMetadata, "users");
      expect(res.needsGroupBy).toBe(true);
    });

    test("Detects needsGroupBy from array relations in sort", () => {
      // "posts" is oneToMany -> isArray is true
      const res = analyzeQuery({ order: { "posts.title": "asc" } }, mockMetadata, "users");
      expect(res.needsGroupBy).toBe(true);
    });
  });
});
