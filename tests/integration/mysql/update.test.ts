import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users } from "./schema";

describe("MySQL Integration - Update Operations", () => {
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
        profiles: { admin: ["update", "read"] }
      })
      .build();

    await db.insert(users).values([
      { name: "Alice", email: "alice@example.com", age: 25 },
      { name: "Bob", email: "bob@example.com", age: 30 },
    ]);
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("updateOne - update single record", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [alice] = await db.select().from(users).where(sql`name = 'Alice'`);
    const updated = await userRepo.updateOne(alice.id, { age: 26 }, "admin");

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

    expect(updated.length).toBeGreaterThanOrEqual(2);
    expect(updated.every((u: any) => u.metadata.theme === "light")).toBe(true);
  });

  test("updateOne - non-existent ID", async () => {
    const userRepo = builder.repoFactory("users", {});
    const updated = await userRepo.updateOne(9999, { age: 40 }, "admin");

    expect(updated).toBeNull();
  });

  test("updateOne - JSON partial update (simulated via replacement)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [alice] = await db.select().from(users).where(sql`name = 'Alice'`);
    await userRepo.updateOne(alice.id, { metadata: { theme: "dark", tags: [] } }, "admin");
    const updated = await userRepo.updateOne(alice.id, { metadata: { theme: "blue", tags: ["new"] } }, "admin");

    expect(updated?.metadata.theme).toBe("blue");
    expect(updated?.metadata.tags).toEqual(["new"]);
  });

  test("updateOne - Individual JSON key update", async () => {
    console.log("----- Starting Individual JSON Key Update Test -----");
    const userRepo = builder.repoFactory("users", {});
    const [bob] = await db.select().from(users).where(sql`name = 'Bob'`);
    console.log("Before update:", bob);

    const affectedRecords = await userRepo.updateOne(bob.id, { metadata: { theme: "initial", tags: ["old"] } }, "admin");
    console.log("After initial update:", affectedRecords);
    const updated = await userRepo.updateOne(bob.id, { "metadata.theme": "updated-key" }, "admin");
    console.log("After partial JSON update:", updated);

    expect(updated).toBeDefined();
    expect(updated?.metadata?.theme).toBe("updated-key");
    expect(updated?.metadata?.tags).toEqual(["old"]);
  });
});
