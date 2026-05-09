import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories } from "./schema";

describe("PostgreSQL Integration - Create Operations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: any;
  let builder: any;

  before(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new pg.Pool({
      connectionString: container!.getConnectionUri(),
    });
    db = drizzle(pool, {
      logger: true,
    });

    // Create tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        metadata JSONB,
        settings JSONB,
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
        profiles: {
          admin: ["create", "read", "update", "softDelete", "restore", "hardDelete"],
        }
      })
      .build();
  });

  after(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  test("createOne - basic record", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "John Doe",
      email: "john@example.com",
      age: 30,
    }, "admin");

    expect(newUser).toBeDefined();
    expect(newUser.id).toBeDefined();
    expect(newUser.name).toBe("John Doe");
    expect(newUser.email).toBe("john@example.com");
  });

  test("createOne - with JSONB data", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "Jane Smith",
      email: "jane@example.com",
      metadata: {
        theme: "dark",
        tags: ["dev", "ts"],
      },
    }, "admin");

    expect(newUser.metadata).toEqual({
      theme: "dark",
      tags: ["dev", "ts"],
    });
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

  test("createMany - bulk insert", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUsers = await userRepo.createMany([
      { name: "User 1", email: "user1@example.com" },
      { name: "User 2", email: "user2@example.com" },
      { name: "User 3", email: "user3@example.com" },
    ], "admin");

    expect(newUsers).toHaveLength(3);
    expect(newUsers.map(u => u.email)).toContain("user1@example.com");
    expect(newUsers.every(u => u.id !== undefined)).toBe(true);
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

    // Drizzle-crud createOne should return the full entity after creation
    expect(newUser).toHaveProperty("deletedFlag", 0);
  });
});
