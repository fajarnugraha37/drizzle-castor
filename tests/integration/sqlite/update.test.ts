import { expect, test, describe, beforeAll } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users } from "./schema";

describe("SQLite Integration - Update Operations", () => {
  let db: any;
  let builder: any;

  beforeAll(async () => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite, {
      logger: true,
    });

    db.run(sql`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        age INTEGER,
        metadata TEXT,
        settings TEXT,
        deleted_flag INTEGER DEFAULT 0,
        deleted_at TEXT
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
    expect(updated.every((u: any) => u.metadata.theme === "light")).toBe(true);
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
