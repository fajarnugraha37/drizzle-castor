import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users } from "./schema";

describe("MySQL Integration - Delete & Restore Operations", () => {
  let container: StartedMySqlContainer;
  let connection: mysql.Connection;
  let db: any;
  let builder: any;

  before(async () => {
    container = await new MySqlContainer("mysql:8.0").start();
    connection = await mysql.createConnection(container.getConnectionUri());
    db = drizzle(connection, {
      logger: true,
    });

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

    builder = createSchemaBuilder(db, [users] as const, "lenient")
      .table("users", {
        softDelete: {
          deleteValue: { deletedFlag: 1, deletedAt: () => new Date() },
          restoreValue: { deletedFlag: 0, deletedAt: null }
        },
        profiles: {
          admin: ["softDelete", "restore", "hardDelete", "read"],
        }
      })
      .build();

    // Seed data
    await db.insert(users).values([
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
      { name: "Charlie", email: "charlie@example.com", deletedFlag: 1, deletedAt: new Date() },
    ]);
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("softDeleteOne - should mark as deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const success = await userRepo.softDeleteOne(1, "admin");

    expect(success).toBe(true);
    
    const user = await userRepo.searchOne({ filter: { id: { $eq: 1 } } }, "admin");
    expect(user).toBeNull();

    const deletedUser = await userRepo.searchDeletedOne({ filter: { id: { $eq: 1 } } }, "admin");
    expect(deletedUser).toBeDefined();
    expect(deletedUser?.deletedFlag).toBe(1);
  });

  test("softDeleteMany - should mark multiple as deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const count = await userRepo.softDeleteMany({ name: { $eq: "Bob" } }, "admin");

    expect(count).toBe(1);
    
    const bob = await userRepo.searchOne({ filter: { name: { $eq: "Bob" } } }, "admin");
    expect(bob).toBeNull();
  });

  test("restoreOne - should bring back soft-deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [charlie] = await db.select().from(users).where(sql`name = 'Charlie'`);
    const success = await userRepo.restoreOne(charlie.id, "admin");

    expect(success).toBe(true);
    
    const restored = await userRepo.searchOne({ filter: { id: { $eq: charlie.id } } }, "admin");
    expect(restored).toBeDefined();
    expect(restored?.deletedFlag).toBe(0);
  });

  test("hardDeleteOne - should permanently remove", async () => {
    const userRepo = builder.repoFactory("users", {});
    const success = await userRepo.hardDeleteOne(1, "admin");

    expect(success).toBe(true);
    
    const alice = await userRepo.searchDeletedOne({ filter: { id: { $eq: 1 } } }, "admin");
    expect(alice).toBeNull();
  });

  test("hardDeleteMany - should permanently remove multiple", async () => {
    const userRepo = builder.repoFactory("users", {});
    const count = await userRepo.hardDeleteMany({ age: { $isNull: true } }, "admin");

    expect(count).toBeGreaterThanOrEqual(1);
  });
});
