import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, migrations } from "./schema";

describe("MySQL Integration - Create Operations", () => {
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
      { name: "Batch 1", email: "b1@example.com" },
      { name: "Batch 2", email: "b2@example.com" },
      { name: "Batch 3", email: "b3@example.com" },
    ], "admin");

    expect(newUsers).toHaveLength(3);
    expect(newUsers[0].id).toBeDefined();
    expect(newUsers[2].id).toBe(newUsers[0].id + 2);
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
