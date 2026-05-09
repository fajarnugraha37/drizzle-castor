import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users } from "./schema";

describe("MySQL Integration - Delete Operations", () => {
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
        settings JSON,
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
          admin: ["softDelete", "restore", "hardDelete", "read", "create"],
        }
      })
      .build();
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("Soft Delete Consistency (One)", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // 1. Create
    const user = await userRepo.createOne({ name: "One", email: "one@example.com" }, "admin");
    expect(user).toBeDefined();

    // 2. Soft Delete
    const success = await userRepo.softDeleteOne(user.id, "admin");
    expect(success).toBe(true);

    // 3. Search (should be empty)
    const found = await userRepo.searchOne({ filter: { id: { $eq: user.id } } }, "admin");
    expect(found).toBeNull();

    // 4. Search Deleted (should exist)
    const deleted = await userRepo.searchDeletedOne({ filter: { id: { $eq: user.id } } }, "admin");
    expect(deleted).toBeDefined();
    expect(deleted?.deletedFlag).toBe(1);

    // 5. Restore
    const restoredSuccess = await userRepo.restoreOne(user.id, "admin");
    expect(restoredSuccess).toBe(true);

    // 6. Search (should exist now)
    const restored = await userRepo.searchOne({ filter: { id: { $eq: user.id } } }, "admin");
    expect(restored).toBeDefined();
    expect(restored?.deletedFlag).toBe(0);
  });

  test("Soft Delete Consistency (Many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // 1. Create Many
    await userRepo.createMany([
      { name: "Many1", email: "m1@example.com" },
      { name: "Many2", email: "m2@example.com" },
    ], "admin");

    // 2. Soft Delete Many
    const count = await userRepo.softDeleteMany({ name: { $like: "Many%" } }, "admin");
    expect(count).toBe(2);

    // 3. Search (should be empty)
    const active = await userRepo.searchMany({ filter: { name: { $like: "Many%" } } }, "admin");
    expect(active).toHaveLength(0);

    // 4. Search Deleted
    const deleted = await userRepo.searchDeletedMany({ filter: { name: { $like: "Many%" } } }, "admin");
    expect(deleted).toHaveLength(2);

    // 5. Restore Many
    const restoredCount = await userRepo.restoreMany({ name: { $like: "Many%" } }, "admin");
    expect(restoredCount).toBe(2);

    // 6. Search (should be back)
    const back = await userRepo.searchMany({ filter: { name: { $like: "Many%" } } }, "admin");
    expect(back).toHaveLength(2);
  });

  test("Hard Delete Consistency", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.createOne({ name: "Hard", email: "hard@example.com" }, "admin");

    const success = await userRepo.hardDeleteOne(user.id, "admin");
    expect(success).toBe(true);

    const deleted = await userRepo.searchDeletedOne({ filter: { id: { $eq: user.id } } }, "admin");
    expect(deleted).toBeNull();
  });
});
