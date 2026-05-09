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
        settings JSON,
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

  test("updateOne - modify json column (replace 1 column)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [alice] = await db.select().from(users).where(sql`name = 'Alice'`);
    await userRepo.updateOne(alice.id, { settings: { theme: "original" } }, "admin");
    const updated = await userRepo.updateOne(alice.id, { settings: { theme: "replaced" } }, "admin");
    expect(updated?.settings.theme).toBe("replaced");
  });

  test("updateOne - modify nested json key (level 2)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [bob] = await db.select().from(users).where(sql`name = 'Bob'`);
    await userRepo.updateOne(bob.id, { 
      settings: { 
        persona: { nickName: "Bob", avatarUrl: "old-url" } 
      } 
    }, "admin");
    
    const updated = await userRepo.updateOne(bob.id, { 
      "settings.persona.avatarUrl": "new-url" 
    }, "admin");

    expect(updated?.settings.persona.avatarUrl).toBe("new-url");
    expect(updated?.settings.persona.nickName).toBe("Bob"); // Should be preserved
  });

  test("updateOne - modify nested json array (level 2)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const [alice] = await db.select().from(users).where(sql`name = 'Alice'`);
    await userRepo.updateOne(alice.id, { 
      settings: { 
        persona: { hobbies: ["coding", "gaming"] } 
      } 
    }, "admin");
    
    // Modify hobbies[1] (gaming -> hiking)
    const updated = await userRepo.updateOne(alice.id, { 
      "settings.persona.hobbies.1": "hiking" 
    }, "admin");

    expect(updated?.settings.persona.hobbies).toEqual(["coding", "hiking"]);
  });

  test("updateMany - modify json key (level 2) bulk", async () => {
    const userRepo = builder.repoFactory("users", {});
    await userRepo.updateMany({}, { settings: { persona: { avatarUrl: "bulk-old" } } }, "admin");
    
    const updated = await userRepo.updateMany(
      { name: { $inArray: ["Alice", "Bob"] } },
      { "settings.persona.avatarUrl": "bulk-new" },
      "admin"
    );

    expect(updated).toHaveLength(2);
    expect(updated.every(u => u.settings.persona.avatarUrl === "bulk-new")).toBe(true);
  });
});
