import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql, eq } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories } from "./schema";

describe("PostgreSQL Integration - Read Operations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: any;
  let builder: any;

  before(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new pg.Pool({
      connectionString: container.getConnectionUri(),
    });
    db = drizzle(pool);

    // Create tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        metadata JSONB,
        deleted_flag INTEGER DEFAULT 0,
        deleted_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        bio TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        author_id INTEGER REFERENCES users(id),
        deleted_flag INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS posts_to_categories (
        post_id INTEGER NOT NULL REFERENCES posts(id),
        category_id INTEGER NOT NULL REFERENCES categories(id),
        PRIMARY KEY (post_id, category_id)
      );
    `);

    builder = createSchemaBuilder(db, [users, profiles, posts, categories, postsToCategories] as const, "lenient")
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
    const [user1] = await db.insert(users).values([
      { name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 },
      { name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 },
      { name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 }, // Soft deleted
    ]).returning();

    await db.insert(profiles).values([
      { bio: "Alice's bio", userId: user1.id }
    ]);

    await db.insert(posts).values([
      { title: "Alice's Post", content: "Hello world", authorId: user1.id, deletedFlag: 0 },
      { title: "Deleted Post", content: "Bye world", authorId: user1.id, deletedFlag: 1 },
    ]);

    // Seed for JSON tests
    await db.insert(users).values([
      { name: "John JSON", email: "john_json@example.com", age: 40, metadata: { theme: "dark", tags: ["expert", "node"] } },
      { name: "Jane JSON", email: "jane_json@example.com", age: 30, metadata: { theme: "light", tags: ["beginner"] } },
    ]);
  });

  after(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  test("searchMany - JSON Filter (nested field)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const users = await userRepo.searchMany({
      filter: {
        "metadata.theme": { $eq: "dark" }
      }
    }, "admin");

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("John JSON");
  });

  test("searchOne - JSON Projection (specific keys)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { email: { $eq: "john_json@example.com" } },
      projection: ["id", "metadata.theme"]
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.metadata).toEqual({ theme: "dark" });
    expect(user?.metadata.tags).toBeUndefined();
  });

  test("searchMany - JSON Order (ascending/descending)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const users = await userRepo.searchMany({
      filter: { email: { $like: "%json@example.com" } },
      order: { "metadata.theme": "asc" }
    }, "admin");

    expect(users[0].name).toBe("John JSON"); // "dark" comes before "light"
    expect(users[1].name).toBe("Jane JSON");
  });

  test("searchOne - basic find", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } }
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
    expect(user?.deletedFlag).toBe(0);
  });

  test("searchOne - should not find soft-deleted by default", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Charlie" } }
    }, "admin");

    expect(user).toBeNull();
  });

  test("searchMany - list all active", async () => {
    const userRepo = builder.repoFactory("users", {});
    const allUsers = await userRepo.searchMany({}, "admin");

    expect(allUsers.length).toBeGreaterThanOrEqual(2); // Alice, Bob + JSON users
    expect(allUsers.map(u => u.name)).toContain("Alice");
    expect(allUsers.map(u => u.name)).toContain("Bob");
  });

  test("searchPage - pagination works", async () => {
    const userRepo = builder.repoFactory("users", {});
    const page = await userRepo.searchPage({
      page: 1,
      pageSize: 2
    }, "admin");

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(2);
  });

  test("searchOne - with relation (one-to-one)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "profile.bio"]
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.profile).toBeDefined();
    expect(user?.profile.bio).toBe("Alice's bio");
  });

  test("searchOne - with relation (one-to-many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "posts.title"]
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.posts).toBeDefined();
    expect(user?.posts).toHaveLength(1); // Only active posts
    expect(user?.posts[0].title).toBe("Alice's Post");
  });

  test("searchDeletedOne - find soft-deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchDeletedOne({
      filter: { name: { $eq: "Charlie" } }
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.name).toBe("Charlie");
  });

  test("searchDeletedMany - list all deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const deletedUsers = await userRepo.searchDeletedMany({}, "admin");

    expect(deletedUsers).toHaveLength(1);
    expect(deletedUsers[0].name).toBe("Charlie");
  });
});
