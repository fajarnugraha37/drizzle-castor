import { expect, test, describe, beforeAll } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts } from "./schema";

describe("SQLite Integration - Create Operations", () => {
  let db: any;
  let builder: any;

  beforeAll(() => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, {
      logger: true,
    });

    db.run(sql`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        metadata TEXT,
        deleted_flag INTEGER DEFAULT 0,
        deleted_at TEXT
      )
    `);

    db.run(sql`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id)
      )
    `);

    db.run(sql`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_id INTEGER REFERENCES users(id),
        deleted_flag INTEGER DEFAULT 0
      )
    `);

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

  test("createOne - verify re-hydration (returning all fields)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "Rehydrate",
      email: "rehydrate@example.com",
    }, "admin");

    expect(newUser).toHaveProperty("deletedFlag", 0);
  });
});
