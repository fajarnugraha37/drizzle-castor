import { expect, test, describe } from "bun:test";
import { hydrateResults } from "../../../src/query-parser/hydrator";
import { pgTable, serial, text, json } from "drizzle-orm/pg-core";

describe("Query Parser: Hydrator", () => {
  // Use real Drizzle tables for reliable metadata
  const usersTable = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name"),
    meta: json("meta"),
  });

  const postsTable = pgTable("posts", {
    id: serial("id").primaryKey(),
    title: text("title"),
    userId: serial("user_id"),
  });

  const profilesTable = pgTable("profiles", {
    id: serial("id").primaryKey(),
    age: serial("age"),
    userId: serial("user_id"),
  });

  const mockMetadata = {
    users: {
      table: usersTable,
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }],
      oneToOne: [{ relationName: "profile", relatedTable: "profiles" }],
    },
    posts: {
      table: postsTable,
    },
    profiles: {
      table: profilesTable,
    },
  } as any;

  test("Hydrates basic rows without relations", () => {
    const rows = [
      { users: { id: 1, name: "John" } },
      { users: { id: 2, name: "Jane" } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    expect(res).toEqual([{ id: 1, name: "John" }, { id: 2, name: "Jane" }]);
  });

  test("Hydrates oneToMany relations", () => {
    const rows = [
      { users: { id: 1, name: "John" }, rel_posts: { id: 10, title: "Post 1" } },
      { users: { id: 1, name: "John" }, rel_posts: { id: 11, title: "Post 2" } },
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", ["posts"]);
    expect(res.length).toBe(1);
    expect(res[0].posts.length).toBe(2);
    expect(res[0].posts[0].id).toBe(10);
  });

  test("Hydrates oneToOne relations", () => {
    const rows = [
      { users: { id: 1 }, rel_profile: { id: 100, age: 30 } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", ["profile"]);
    expect(res.length).toBe(1);
    expect(res[0].profile.age).toBe(30);
  });

  test("Unflattens JSON arrays correctly", () => {
    const rows = [
      { users: { id: 1, "skills.0": "java", "skills.1": "ts" } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    expect(res[0].skills).toEqual(["java", "ts"]);
  });
  
  test("Unflattens JSON objects correctly", () => {
    const rows = [
      { users: { id: 1, "settings.theme": "dark" } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    expect(res[0].settings).toEqual({ theme: "dark" });
  });

  test("Safely handles JSON parsing of strings using metadata", () => {
    const rows = [
      { users: { id: 1, "meta": '{"a":1}', "name": '{"not": "json"}' } },
      { users: { id: 2, "meta": 'invalid_json' } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    
    // Should parse 'meta' because it's marked as JSON in metadata
    expect(res[0].meta).toEqual({ a: 1 });
    
    // Should NOT parse 'name' even if it looks like JSON, because it's marked as string
    expect(res[0].name).toEqual('{"not": "json"}');
    
    expect(res[1].meta).toEqual("invalid_json"); // keeps as string if invalid
  });

  test("Parses JSON results from dot-notation keys (extractions)", () => {
    const rows = [
      { users: { id: 1, "persona.skills": '["js", "ts"]' } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    
    // Should parse because key contains a dot (likely result of json_extract)
    expect(res[0].persona.skills).toEqual(["js", "ts"]);
  });
});
