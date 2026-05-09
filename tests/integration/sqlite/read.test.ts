import { expect, test, describe, beforeAll } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts } from "./schema";

describe("SQLite Integration - Read Operations", () => {
  let db: any;
  let builder: any;

  beforeAll(async () => {
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
        oneToOne: [
          {
            relationName: "profile",
            relatedTable: "profiles",
            localKey: "users.id",
            foreignKey: "profiles.userId",
          }
        ],
        oneToMany: [
          {
            relationName: "posts",
            relatedTable: "posts",
            localKey: "users.id",
            foreignKey: "posts.authorId",
          }
        ],
        softDelete: {
          deleteValue: { deletedFlag: 1 },
          restoreValue: { deletedFlag: 0 }
        }
      })
      .table("posts", {
        manyToOne: [
          {
            relationName: "author",
            relatedTable: "users",
            localKey: "posts.authorId",
            foreignKey: "users.id",
          }
        ],
        softDelete: {
          deleteValue: { deletedFlag: 1 },
          restoreValue: { deletedFlag: 0 }
        }
      })
      .build();

    // Seed data
    const userRepo = builder.repoFactory("users", {});
    const profileRepo = builder.repoFactory("profiles", {});
    const postRepo = builder.repoFactory("posts", {});

    await userRepo.createOne({ name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 });
    await userRepo.createOne({ name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 });
    await userRepo.createOne({ name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 });

    await profileRepo.createOne({ bio: "Alice's bio", userId: 1 });
    await postRepo.createOne({ title: "Alice's Post", authorId: 1, deletedFlag: 0 });
    await postRepo.createOne({ title: "Deleted Post", authorId: 1, deletedFlag: 1 });

    // Seed for JSON tests
    await userRepo.createOne({ name: "John JSON", email: "john_json@example.com", age: 40, metadata: { theme: "dark", tags: ["expert", "node"] } });
    await userRepo.createOne({ name: "Jane JSON", email: "jane_json@example.com", age: 30, metadata: { theme: "light", tags: ["beginner"] } });
  });

  test("searchMany - JSON Filter (nested field)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { "metadata.theme": { $eq: "dark" } }
    });

    expect(usersResult).toHaveLength(1);
    expect(usersResult[0].name).toBe("John JSON");
  });

  test("searchOne - JSON Projection (specific keys)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { email: { $eq: "john_json@example.com" } },
      projection: ["id", "metadata.theme"]
    });

    expect(user).toBeDefined();
    expect(user?.metadata).toEqual({ theme: "dark" });
    expect(user?.metadata.tags).toBeUndefined();
  });

  test("searchMany - JSON Order", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { email: { $like: "%json@example.com" } },
      order: { "metadata.theme": "asc" }
    });

    expect(usersResult[0].name).toBe("John JSON"); // "dark" < "light"
    expect(usersResult[1].name).toBe("Jane JSON");
  });

  test("searchOne - basic find", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } }
    });

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
  });

  test("searchOne - should not find soft-deleted by default", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Charlie" } }
    });

    expect(user).toBeNull();
  });

  test("searchMany - list all active", async () => {
    const userRepo = builder.repoFactory("users", {});
    const allUsers = await userRepo.searchMany({});

    expect(allUsers.length).toBeGreaterThanOrEqual(2);
    expect(allUsers.map(u => u.name)).toContain("Alice");
    expect(allUsers.map(u => u.name)).toContain("Bob");
  });

  test("searchPage - pagination works", async () => {
    const userRepo = builder.repoFactory("users", {});
    const page = await userRepo.searchPage({
      page: 1,
      pageSize: 2
    });

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(2);
  });

  test("searchOne - with relation (one-to-one)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "profile.bio"]
    });

    expect(user?.profile?.bio).toBe("Alice's bio");
  });

  test("searchOne - with relation (one-to-many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "posts.title"]
    });

    expect(user?.posts).toHaveLength(1);
    expect(user?.posts[0].title).toBe("Alice's Post");
  });

  test("searchDeletedOne - find soft-deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchDeletedOne({
      filter: { name: { $eq: "Charlie" } }
    });

    expect(user).toBeDefined();
    expect(user?.name).toBe("Charlie");
  });

  test("searchDeletedMany - list all deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const deletedUsers = await userRepo.searchDeletedMany({});

    expect(deletedUsers.length).toBeGreaterThanOrEqual(1);
    expect(deletedUsers.some(u => u.name === "Charlie")).toBe(true);
  });
});
