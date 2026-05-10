import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories, migrations } from "./schema";

describe("PostgreSQL Integration - Update Operations", () => {
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
        profiles: {
          admin: ["update", "read"],
        }
      })
      .build();

    // Seed data
    await db.insert(users).values([
      { id: 1, name: "Alice", email: "alice@example.com", age: 25 },
      { id: 2, name: "Bob", email: "bob@example.com", age: 30 },
    ]);
  });

  after(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  test("updateOne - update single record", async () => {
    const userRepo = builder.repoFactory("users", {});
    const updated = await userRepo.updateOne(1, { age: 26 }, "admin");

    expect(updated).toBeDefined();
    expect(updated?.age).toBe(26);
    expect(updated?.name).toBe("Alice");
  });

  test("updateMany - update multiple records", async () => {
    const userRepo = builder.repoFactory("users", {});
    const updated = await userRepo.updateMany(
      { age: { $gt: 20 } },
      { metadata: { theme: "light", tags: ["updated"] } },
      "admin"
    );

    expect(updated).toHaveLength(2);
    expect(updated.every(u => u.metadata.theme === "light")).toBe(true);
  });

  test("updateOne - non-existent ID", async () => {
    const userRepo = builder.repoFactory("users", {});
    const updated = await userRepo.updateOne(999, { age: 40 }, "admin");

    expect(updated).toBeNull();
  });

  test("updateOne - JSON partial update (simulated via replacement)", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.updateOne(1, { metadata: { theme: "dark", tags: [] } }, "admin");
    const updated = await userRepo.updateOne(1, { metadata: { theme: "blue", tags: ["new"] } }, "admin");

    expect(updated?.metadata.theme).toBe("blue");
    expect(updated?.metadata.tags).toEqual(["new"]);
  });

  test("updateOne - Individual JSON key update", async () => {
    const userRepo = builder.repoFactory("users", {});
    // Initial state: metadata is null or exists from previous tests. Let's ensure a clean state for id: 2
    await userRepo.updateOne(2, { metadata: { theme: "initial", tags: ["old"] } }, "admin");
    
    // Update ONLY the theme key inside metadata
    const updated = await userRepo.updateOne(2, { "metadata.theme": "updated-key" }, "admin");

    expect(updated?.metadata.theme).toBe("updated-key");
    expect(updated?.metadata.tags).toEqual(["old"]); // Should PRESERVE existing keys
  });

  test("updateOne - modify json column (replace)", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.updateOne(1, { settings: { theme: "original" } }, "admin");
    const updated = await userRepo.updateOne(1, { settings: { theme: "replaced" } }, "admin");
    expect(updated?.settings.theme).toBe("replaced");
  });

  test("updateOne - modify nested json key (level 2)", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.updateOne(2, { 
      settings: { 
        persona: { nickName: "Bob", avatarUrl: "old-url" } 
      } 
    }, "admin");
    
    const updated = await userRepo.updateOne(2, { 
      "settings.persona.avatarUrl": "new-url" 
    }, "admin");

    expect(updated?.settings.persona.avatarUrl).toBe("new-url");
    expect(updated?.settings.persona.nickName).toBe("Bob"); // Should be preserved
  });

  test("updateOne - modify nested json array (level 2)", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.updateOne(1, { 
      settings: { 
        persona: { hobbies: ["coding", "gaming"] } 
      } 
    }, "admin");
    
    // Modify hobbies[1] (gaming -> hiking)
    const updated = await userRepo.updateOne(1, { 
      "settings.persona.hobbies.1": "hiking" 
    }, "admin");

    expect(updated?.settings.persona.hobbies).toEqual(["coding", "hiking"]);
  });
});
