import { expect, test, describe } from "bun:test";
import { findRelationDefinition, isRelation, resolvePathSegments, resolveRelationPath } from "../../../src/query-parser/metadata-explorer";
import { QueryParsingError } from "../../../src/errors";

describe("Query Parser: Metadata Explorer", () => {
  const mockMetadata = {
    users: {
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }],
      oneToOne: [{ relationName: "profile", relatedTable: "profiles" }],
    },
    posts: {
      manyToOne: [{ relationName: "author", relatedTable: "users" }],
      manyToMany: [{ relationName: "tags", relatedTable: "tags" }],
    }
  };

  describe("findRelationDefinition", () => {
    test("Returns relation node if exists", () => {
      const rel = findRelationDefinition(mockMetadata, "users", "posts");
      expect(rel).toBeDefined();
      expect(rel?.type).toBe("oneToMany");
      expect(rel?.isArray).toBe(true);
    });

    test("Returns null if table metadata does not exist", () => {
      expect(findRelationDefinition(mockMetadata, "unknown", "posts")).toBeNull();
    });

    test("Returns null if relation does not exist", () => {
      expect(findRelationDefinition(mockMetadata, "users", "unknown")).toBeNull();
    });
  });

  describe("isRelation", () => {
    test("Returns true for valid relation", () => {
      expect(isRelation(mockMetadata, "users", "profile")).toBe(true);
    });
    test("Returns false for invalid relation", () => {
      expect(isRelation(mockMetadata, "users", "age")).toBe(false);
    });
  });

  describe("resolvePathSegments", () => {
    test("Resolves purely relational path", () => {
      const res = resolvePathSegments(mockMetadata, "users", "posts.author");
      expect(res.nodes.length).toBe(2);
      expect(res.jsonPath).toBeUndefined();
      expect(res.relationPath).toBe("posts.author");
    });

    test("Resolves path with JSON tail", () => {
      const res = resolvePathSegments(mockMetadata, "users", "profile.settings.theme");
      expect(res.nodes.length).toBe(1);
      expect(res.jsonPath).toBe("settings.theme");
      expect(res.relationPath).toBe("profile");
    });

    test("Resolves base table JSON path", () => {
      const res = resolvePathSegments(mockMetadata, "users", "settings.theme");
      expect(res.nodes.length).toBe(0);
      expect(res.jsonPath).toBe("settings.theme");
      expect(res.relationPath).toBe("");
    });
  });

  describe("resolveRelationPath", () => {
    test("Resolves purely relational path", () => {
      const nodes = resolveRelationPath(mockMetadata, "users", "posts");
      expect(nodes.length).toBe(1);
    });

    test("Throws QueryParsingError if path contains JSON tail", () => {
      expect(() => resolveRelationPath(mockMetadata, "users", "posts.title")).toThrow(QueryParsingError);
    });
  });
});
