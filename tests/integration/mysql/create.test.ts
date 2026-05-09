import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories } from "./schema";

describe("MySQL Integration - Create Operations", () => {
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
        profiles: { admin: ["create", "read"] }
      })
      .build();
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("createOne - basic record", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "MySQL User",
      email: "mysql@example.com",
      age: 25,
    }, "admin");

    expect(newUser).toBeDefined();
    expect(newUser.id).toBeDefined();
    expect(newUser.name).toBe("MySQL User");
  });

  test("createOne - with JSON data", async () => {
    const userRepo = builder.repoFactory("users", {});
    const newUser = await userRepo.createOne({
      name: "JSON User",
      email: "json@example.com",
      metadata: { theme: "dark", tags: ["mysql", "json"] }
    }, "admin");

    expect(newUser.metadata).toEqual({ theme: "dark", tags: ["mysql", "json"] });
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
    
    await expect(userRepo.createOne({ name: "Duplicate", email: "unique@example.com" }, "admin"))
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
