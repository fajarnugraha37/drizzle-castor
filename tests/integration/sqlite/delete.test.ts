import { expect, test, describe, beforeAll } from "bun:test";
import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { migrations, users } from "./schema";

describe("SQLite Integration - Delete & Restore Operations", () => {
  let db: BunSQLiteDatabase;
  let builder: any;

  beforeAll(async () => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, {
      logger: true,
    });

    for (const ddl of migrations) {
      db.run(ddl);
    }

    builder = createSchemaBuilder(db, [users] as const, "lenient")
      .table("users", {
        softDelete: {
          deleteValue: { deletedFlag: 1, deletedAt: () => new Date().toISOString() },
          restoreValue: { deletedFlag: 0, deletedAt: null }
        },
        profiles: { admin: ["softDelete", "restore", "hardDelete", "read"] }
      })
      .build();

    await db.insert(users).values([
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@example.com" },
      { id: 3, name: "Charlie", email: "charlie@example.com", deletedFlag: 1, deletedAt: new Date().toISOString() },
    ]);
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
    expect(deletedUser?.deletedAt).toBeDefined();
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
    const success = await userRepo.restoreOne(3, "admin");

    expect(success).toBe(true);
    
    const restored = await userRepo.searchOne({ filter: { id: { $eq: 3 } } }, "admin");
    expect(restored).toBeDefined();
    expect(restored?.deletedFlag).toBe(0);
    expect(restored?.deletedAt).toBeNull();
  });

  test("restoreMany - should bring back multiple soft-deleted records", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // Seed some deleted records. 
    // MUST provide deletedAt because it's configured as dynamic in softDelete config, 
    // which causes injectSoftDeleteFilter to add IS NOT NULL condition.
    await userRepo.createOne({ name: "D1", email: "d1@ex.com", deletedFlag: 1, deletedAt: new Date().toISOString() }, "admin");
    await userRepo.createOne({ name: "D2", email: "d2@ex.com", deletedFlag: 1, deletedAt: new Date().toISOString() }, "admin");

    const count = await userRepo.restoreMany({ name: { $like: "D%" } }, "admin");
    expect(count).toBe(2);

    const active = await userRepo.searchMany({ filter: { name: { $like: "D%" } } }, "admin");
    expect(active).toHaveLength(2);
    expect(active.every((u: any) => u.deletedFlag === 0)).toBe(true);
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
