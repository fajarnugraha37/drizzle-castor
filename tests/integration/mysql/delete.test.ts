import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { createSchemaBuilder } from "../../../src";
import { migrations, users } from "./schema";

describe("MySQL Integration - Delete Operations", () => {
  let container: StartedMySqlContainer;
  let connection: mysql.Connection;
  let db: MySql2Database;
  let builder: any;

  before(async () => {
    container = await new MySqlContainer("mysql:8.0")
      .withCommand([
        "--skip-log-bin",
        "--performance-schema=OFF",
        "--innodb-buffer-pool-size=64M",
        "--sync-binlog=0",
        "--innodb-flush-log-at-trx-commit=2", // test-safe, lebih cepat
      ])
      .withBindMounts([])
      .withTmpFs({ "/var/lib/mysql": "rw" })
      .start();
    connection = await mysql.createConnection(container.getConnectionUri());
    db = drizzle(connection, {
      logger: true,
    });

    for (const migration of migrations) {
      await db.execute(migration);
    }

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

  test("Hard Delete Many Consistency", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // Seed some records
    await userRepo.createMany([
      { name: "HM1", email: "hm1@ex.com", age: 100 },
      { name: "HM2", email: "hm2@ex.com", age: 100 },
    ], "admin");

    const count = await userRepo.hardDeleteMany({ age: { $eq: 100 } }, "admin");
    expect(count).toBe(2);

    const found = await userRepo.searchMany({ filter: { age: { $eq: 100 } } }, "admin");
    expect(found).toHaveLength(0);
    
    const deleted = await userRepo.searchDeletedMany({ filter: { age: { $eq: 100 } } }, "admin");
    expect(deleted).toHaveLength(0);
  });
});
