import { expect, test, describe, beforeAll } from "bun:test";
import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, migrations } from "./schema";

describe("SQLite Integration - Create Operations", () => {
  let db: BunSQLiteDatabase;
  let builder: any;

  beforeAll(() => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, {
      logger: true,
    });

    for (const ddl of migrations) {
      db.run(ddl);
    }

    builder = createSchemaBuilder(db, [users, profiles, posts] as const, "lenient")
      .table("users", {
        profiles: { admin: ["create", "read"] }
      })
      .build();
  });

  test("createOne - basic record", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "SQLite User",
      email: "sqlite@example.com",
      age: 25,
    }, "admin");

    expect(newUser).toBeDefined();
    expect(newUser.id).toBe(1);
    expect(newUser.name).toBe("SQLite User");
  });

  test("createOne - with JSON data", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "JSON User",
      email: "json@example.com",
      metadata: { theme: "dark", tags: ["sqlite", "json"] }
    }, "admin");

    expect(newUser.metadata).toEqual({ theme: "dark", tags: ["sqlite", "json"] });
  });

  test("createMany - bulk insert", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUsers = await userRepo.createMany([
      { name: "Batch 1", email: "b1@example.com" },
      { name: "Batch 2", email: "b2@example.com" },
      { name: "Batch 3", email: "b3@example.com" },
    ], "admin");

    expect(newUsers).toHaveLength(3);
    expect(newUsers[0].id).toBeDefined();
    expect(newUsers[2].id).toBe(newUsers[0].id + 2);
  });

  test("createOne - duplicate email should throw", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.createOne({ name: "Unique", email: "unique@example.com" }, "admin");
    
    expect(userRepo.createOne({ name: "Duplicate", email: "unique@example.com" }, "admin"))
      .rejects.toThrow();
  });

  test("createOne - with complex nested JSON data", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "Complex JSON User",
      email: "complex_json@example.com",
      settings: { 
        persona: { 
          nickName: "CJ", 
          avatarUrl: "http://example.com/av.png",
          hobbies: ["coding", "reading"]
        } 
      }
    }, "admin");

    expect(newUser.settings.persona.nickName).toBe("CJ");
    expect(newUser.settings.persona.hobbies).toContain("coding");
  });

  test("createMany - with JSON columns", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUsers = await userRepo.createMany([
      { name: "Bulk JSON 1", email: "bj1@example.com", metadata: { theme: "dark", tags: ["a"] } },
      { name: "Bulk JSON 2", email: "bj2@example.com", metadata: { theme: "light", tags: ["b"] } },
    ], "admin");

    expect(newUsers).toHaveLength(2);
    expect(newUsers[0].metadata.theme).toBe("dark");
    expect(newUsers[1].metadata.theme).toBe("light");
  });
});
