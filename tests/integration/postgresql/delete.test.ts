import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { migrations, users } from "./schema";

describe("PostgreSQL Integration - Delete & Restore Operations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: NodePgDatabase;
  let builder: any;

  before(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withCommand([
        "postgres",
        "-c", "shared_buffers=64MB",
        "-c", "wal_level=minimal",
        "-c", "max_wal_senders=0",
        "-c", "synchronous_commit=off",
        "-c", "fsync=off",           // ⚠️ ONLY FOR TEST
        "-c", "full_page_writes=off",
        "-c", "autovacuum=off",
        "-c", "checkpoint_timeout=30min",
        "-c", "max_connections=10",
      ])
      .withBindMounts([])
      .withTmpFs({ "/var/lib/postgresql/data": "rw" }) 
      .start();
    pool = new pg.Pool({
      connectionString: container.getConnectionUri(),
    });
    db = drizzle(pool, {
      logger: true,
    });

    for (const ddl of migrations) {
      await db.execute(ddl);
    }
    
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
      { id: 1, name: "Alice", email: "alice@example.com" },
      { id: 2, name: "Bob", email: "bob@example.com" },
      { id: 3, name: "Charlie", email: "charlie@example.com", deletedFlag: 1, deletedAt: new Date() },
    ]);
  });

  after(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  test("softDeleteOne - should mark as deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const success = await userRepo.softDeleteOne(1, "admin");

    expect(success).toBe(true);
    
    // Verify it's not searchable by normal search
    const user = await userRepo.searchOne({ filter: { id: { $eq: 1 } } }, "admin");
    expect(user).toBeNull();

    // Verify it's searchable by searchDeleted
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
    
    const charlie = await userRepo.searchOne({ filter: { id: { $eq: 3 } } }, "admin");
    expect(charlie).toBeDefined();
    expect(charlie?.deletedFlag).toBe(0);
    expect(charlie?.deletedAt).toBeNull();
  });

  test("restoreMany - should bring back multiple soft-deleted records", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // Seed some deleted records
    await db.insert(users).values([
      { id: 4, name: "D1", email: "d1@ex.com", deletedFlag: 1, deletedAt: new Date() },
      { id: 5, name: "D2", email: "d2@ex.com", deletedFlag: 1, deletedAt: new Date() },
    ]);

    const count = await userRepo.restoreMany({ name: { $like: "D%" } }, "admin");
    expect(count).toBe(2);

    const active = await userRepo.searchMany({ filter: { name: { $like: "D%" } } }, "admin");
    expect(active).toHaveLength(2);
    expect(active.every((u: any) => u.deletedFlag === 0)).toBe(true);
  });

  test("hardDeleteOne - should permanently remove", async () => {
    const userRepo = builder.repoFactory("users", {});
    // Delete Alice (who was soft-deleted in first test)
    const success = await userRepo.hardDeleteOne(1, "admin");

    expect(success).toBe(true);
    
    const alice = await userRepo.searchDeletedOne({ filter: { id: { $eq: 1 } } }, "admin");
    expect(alice).toBeNull();
  });

  test("hardDeleteMany - should permanently remove multiple", async () => {
    const userRepo = builder.repoFactory("users", {});
    // Delete Bob (soft-deleted) and Charlie (active)
    const count = await userRepo.hardDeleteMany({ age: { $isNull: true } }, "admin");

    expect(count).toBeGreaterThanOrEqual(1);
  });
});
