import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories } from "./schema";

describe("MySQL Integration - Read Operations", () => {
  let container: StartedMySqlContainer;
  let connection: mysql.Connection;
  let db: any;
  let builder: any;

  before(async () => {
    container = await new MySqlContainer("mysql:8.0").start();
    connection = await mysql.createConnection(container.getConnectionUri());
    db = drizzle(connection);

    await db.execute(sql`
      CREATE TABLE users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name TEXT NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        age INT,
        metadata JSON,
        deleted_flag INT DEFAULT 0,
        deleted_at TIMESTAMP NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bio TEXT,
        user_id INT NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        author_id INT,
        deleted_flag INT DEFAULT 0
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
    await db.insert(users).values([
      { name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 },
      { name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 },
      { name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 },
    ]);

    const [alice] = await db.select().from(users).where(sql`name = 'Alice'`);
    
    await db.insert(profiles).values([
      { bio: "Alice's bio", userId: alice.id }
    ]);

    await db.insert(posts).values([
      { title: "Alice's Post", content: "Hello world", authorId: alice.id, deletedFlag: 0 },
      { title: "Deleted Post", content: "Bye world", authorId: alice.id, deletedFlag: 1 },
    ]);

    // Seed for JSON tests
    await db.insert(users).values([
      { name: "John JSON", email: "john_json@example.com", age: 40, metadata: { theme: "dark", tags: ["expert", "node"] } },
      { name: "Jane JSON", email: "jane_json@example.com", age: 30, metadata: { theme: "light", tags: ["beginner"] } },
    ]);
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("searchMany - JSON Filter (nested field)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { "metadata.theme": { $eq: "dark" } }
    }, "admin");

    expect(usersResult).toHaveLength(1);
    expect(usersResult[0].name).toBe("John JSON");
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

  test("searchMany - JSON Order", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { email: { $like: "%json@example.com" } },
      order: { "metadata.theme": "asc" }
    }, "admin");

    expect(usersResult[0].name).toBe("John JSON"); // "dark" < "light"
    expect(usersResult[1].name).toBe("Jane JSON");
  });

  test("searchOne - basic find", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } }
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
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

    expect(allUsers.length).toBeGreaterThanOrEqual(2);
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

    expect(user?.profile?.bio).toBe("Alice's bio");
  });

  test("searchOne - with relation (one-to-many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "posts.title"]
    }, "admin");

    expect(user?.posts).toHaveLength(1);
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

    expect(deletedUsers.length).toBeGreaterThanOrEqual(1);
    expect(deletedUsers.some(u => u.name === "Charlie")).toBe(true);
  });
});
