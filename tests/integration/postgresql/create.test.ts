import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories, migrations } from "./schema";

describe("PostgreSQL Integration - Create Operations", () => {
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
      connectionString: container!.getConnectionUri(),
    });
    db = drizzle(pool, {
      logger: true,
    });

    for (const ddl of migrations) {
      await db.execute(ddl);
    }

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
