import { expect, test, describe } from "bun:test";
import { hydrateResults } from "./hydrator";

describe("Query Parser: Hydrator", () => {
  const mockMetadata = {
    users: {
      oneToMany: [{ relationName: "posts", relatedTable: "posts" }],
      oneToOne: [{ relationName: "profile", relatedTable: "profiles" }],
    }
  };

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
      { users: { id: 1 }, rel_profile: { age: 30 } }
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

  test("Safely handles JSON parsing of strings", () => {
    const rows = [
      { users: { id: 1, "meta": '{"a":1}' } },
      { users: { id: 2, "meta": 'invalid_json' } }
    ];
    const res = hydrateResults(rows, "users", mockMetadata, "id", []);
    expect(res[0].meta).toEqual({ a: 1 });
    expect(res[1].meta).toEqual("invalid_json"); // keeps as string
  });
});
