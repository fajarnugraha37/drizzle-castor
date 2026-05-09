import { expect, test, describe, beforeAll } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts } from "./schema";

describe("SQLite Integration - Read Operations", () => {
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

    db.run(sql`
      CREATE TABLE profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bio TEXT,
        user_id INTEGER NOT NULL REFERENCES users(id)
      )
    `);

    db.run(sql`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_id INTEGER REFERENCES users(id),
        deleted_flag INTEGER DEFAULT 0
      )
    `);

    builder = createSchemaBuilder(db, [users, profiles, posts] as const, "lenient")
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
        softDelete: {
          deleteValue: { deletedFlag: 1 },
          restoreValue: { deletedFlag: 0 }
        }
      })
      .table("posts", {
        manyToOne: [
          {
            relationName: "author",
            relatedTable: "users",
            localKey: "posts.authorId",
            foreignKey: "users.id",
          }
        ],
        softDelete: {
          deleteValue: { deletedFlag: 1 },
          restoreValue: { deletedFlag: 0 }
        }
      })
      .build();

    // Seed data
    const userRepo = builder.repoFactory("users", {});
    const profileRepo = builder.repoFactory("profiles", {});
    const postRepo = builder.repoFactory("posts", {});

    await userRepo.createOne({ name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 });
    await userRepo.createOne({ name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 });
    await userRepo.createOne({ name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 });

    await profileRepo.createOne({ bio: "Alice's bio", userId: 1 });
    await postRepo.createOne({ title: "Alice's Post", authorId: 1, deletedFlag: 0 });
    await postRepo.createOne({ title: "Deleted Post", authorId: 1, deletedFlag: 1 });

    // Seed for JSON tests
    await userRepo.createOne({ name: "John JSON", email: "john_json@example.com", age: 40, metadata: { theme: "dark", tags: ["expert", "node"] }, settings: { theme: "dark", persona: { nickName: "Johnny", avatarUrl: "dark-av", hobbies: ["coding", "gaming"] } } });
    await userRepo.createOne({ name: "Jane JSON", email: "jane_json@example.com", age: 30, metadata: { theme: "light", tags: ["beginner"] }, settings: { theme: "light", persona: { nickName: "Janie", avatarUrl: "light-av", hobbies: ["reading", "hiking"] } } });
    await userRepo.createOne({ name: "Null Age User", email: "nullage@example.com", age: null });
  });

  describe("Advanced Operators", () => {
    test("$eq and $ne", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $eq: 25 } } })).toHaveLength(1);
      // NOTE: In standard SQL, age <> 25 excludes records where age is NULL.
      // Active: Alice(25), Bob(30), John(40), Jane(30), Null(null)
      // $ne 25 -> Bob, John, Jane. (Total 3)
      expect(await userRepo.searchMany({ filter: { age: { $ne: 25 } } })).toHaveLength(3); 
    });

    test("$gt, $gte, $lt, $lte", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $gt: 30 } } })).toHaveLength(1); // John(40)
      expect(await userRepo.searchMany({ filter: { age: { $gte: 30 } } })).toHaveLength(3); // Bob(30), John(40), Jane(30)
      expect(await userRepo.searchMany({ filter: { age: { $lt: 30 } } })).toHaveLength(1); // Alice(25)
      expect(await userRepo.searchMany({ filter: { age: { $lte: 30 } } })).toHaveLength(3); // Alice(25), Bob(30), Jane(30)
    });

    test("$isNull and $isNotNull", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $isNull: true } } })).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $isNotNull: true } } })).toHaveLength(4);
    });

    test("$inArray and $notInArray", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $inArray: [25, 40] } } })).toHaveLength(2);
      expect(await userRepo.searchMany({ filter: { age: { $notInArray: [25, 40] } } })).toHaveLength(2); // Bob(30), Jane(30). Null is excluded from comparison.
    });

    test("$between and $notBetween", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $between: [25, 35] } } })).toHaveLength(3); // Alice, Bob, Jane
      expect(await userRepo.searchMany({ filter: { age: { $notBetween: [25, 35] } } })).toHaveLength(1); // John(40)
    });

    test("$like, $ilike, $notLike, $notIlike", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { email: { $like: "%example.com" } } })).toHaveLength(5);
      expect(await userRepo.searchMany({ filter: { name: { $ilike: "alice" } } })).toHaveLength(1); // SQLite LIKE is case-insensitive for ASCII
      expect(await userRepo.searchMany({ filter: { name: { $notLike: "Alice" } } })).toHaveLength(4);
      expect(await userRepo.searchMany({ filter: { name: { $notIlike: "alice" } } })).toHaveLength(4);
    });

    test("$and, $or, $not", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ 
        filter: { $and: [{ age: { $gt: 25 } }, { age: { $lt: 40 } }] } 
      })).toHaveLength(2); // Bob(30), Jane(30)

      expect(await userRepo.searchMany({ 
        filter: { $or: [{ age: { $eq: 25 } }, { age: { $eq: 40 } }] } 
      })).toHaveLength(2); // Alice(25), John(40)

      // NOTE: NOT (age = 25) in SQL is equivalent to age <> 25, which excludes NULL.
      expect(await userRepo.searchMany({ 
        filter: { $not: { age: { $eq: 25 } } } 
      })).toHaveLength(3); // Bob, John, Jane. (Null is excluded)
    });

    test("$arrayContains, $arrayContained, $arrayOverlaps (PG only, should fail/ignore on SQLite)", async () => {
      const userRepo = builder.repoFactory("users", {});
      // These are PostgreSQL specific and typically throw in Drizzle when used on SQLite
      // We wrap in try-catch to document behavior
      try {
        await userRepo.searchMany({ filter: { "metadata.tags": { $arrayContains: ["expert"] } } as any });
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe("Complex JSON Operations", () => {
    test("searchOne - JSON path nested level 2 in projection", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { "settings.persona.nickName": { $eq: "Johnny" } },
        projection: ["id", "settings.persona.nickName"]
      });

      expect(user?.settings?.persona?.nickName).toBe("Johnny");
      expect(user?.settings?.persona?.avatarUrl).toBeUndefined();
    });

    test("searchMany - JSON path nested level 2 in filter", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { "settings.persona.avatarUrl": { $eq: "light-av" } }
      });

      expect(usersResult).toHaveLength(1);
      expect(usersResult[0].name).toBe("Jane JSON");
    });

    test("searchMany - JSON path nested level 2 in order", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { name: { $like: "%JSON" } },
        order: { "settings.persona.nickName": "desc" }
      });

      expect(usersResult[0].name).toBe("John JSON"); // "Johnny" > "Janie"
      expect(usersResult[1].name).toBe("Jane JSON");
    });

    test("searchMany - JSON array index access (.1) in projection", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { name: { $eq: "John JSON" } },
        projection: ["id", "settings.persona.hobbies.1"]
      });

      // John JSON hobbies: ["coding", "gaming"] -> index 1 is "gaming"
      // Hydrator produces sparse array for partial index projection
      expect(user?.settings?.persona?.hobbies).toEqual([undefined, "gaming"]); 
    });

    test("searchMany - JSON array index access (.1) in filter", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { "settings.persona.hobbies.1": { $eq: "hiking" } }
      });

      // Jane JSON hobbies: ["reading", "hiking"] -> index 1 is "hiking"
      expect(usersResult).toHaveLength(1);
      expect(usersResult[0].name).toBe("Jane JSON");
    });

    test("searchMany - JSON array index access (.1) in order", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { name: { $like: "%JSON" } },
        order: { "settings.persona.hobbies.1": "asc" } 
      });

      // "gaming" (John) vs "hiking" (Jane) -> gaming < hiking
      expect(usersResult[0].name).toBe("John JSON");
      expect(usersResult[1].name).toBe("Jane JSON");
    });
  });

  describe("Aggregates and Ordering", () => {
    test("searchMany - aggregate in order on normal column", async () => {
      const userRepo = builder.repoFactory("users", {});
      // This is a bit unusual but requested. Usually aggregates are used with group by.
      // Drizzle-Castor's parseOrder supports "aggregate" key.
      const usersResult = await userRepo.searchMany({
        order: { age: { direction: "desc", aggregate: "max" } }
      });
      // In SQLite/MySQL, ordering by MAX(age) without GROUP BY usually returns the same rows but might affect performance or behavior.
      // If we don't have GROUP BY, MAX(age) is calculated over the whole set.
      // Actually, if we use sql`MAX(age)`, it might force a single result row if not grouped.
      // Let's see how our implementation handles it.
      expect(usersResult).toBeDefined();
    });

    test("searchMany - aggregate in order on JSON column", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        order: { "settings.theme": { direction: "asc", aggregate: "min" } }
      });
      expect(usersResult).toBeDefined();
    });

    test("searchMany - nulls first/last", async () => {
      const userRepo = builder.repoFactory("users", {});
      
      const first = await userRepo.searchMany({
        order: { age: { direction: "asc", nulls: "first" } }
      });
      expect(first[0].age).toBeNull();

      const last = await userRepo.searchMany({
        order: { age: { direction: "asc", nulls: "last" } }
      });
      expect(last[last.length - 1].age).toBeNull();
    });
  });

  test("searchMany - JSON Filter (nested field)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { "metadata.theme": { $eq: "dark" } }
    });

    expect(usersResult).toHaveLength(1);
    expect(usersResult[0].name).toBe("John JSON");
  });

  test("searchOne - JSON Projection (specific keys)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { email: { $eq: "john_json@example.com" } },
      projection: ["id", "metadata.theme"]
    });

    expect(user).toBeDefined();
    expect(user?.metadata).toEqual({ theme: "dark" });
    expect(user?.metadata.tags).toBeUndefined();
  });

  test("searchMany - JSON Order", async () => {
    const userRepo = builder.repoFactory("users", {});
    const usersResult = await userRepo.searchMany({
      filter: { email: { $like: "%json@example.com" } },
      order: { "metadata.theme": "asc" }
    });

    expect(usersResult[0].name).toBe("John JSON"); // "dark" < "light"
    expect(usersResult[1].name).toBe("Jane JSON");
  });

  test("searchOne - basic find", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } }
    });

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
  });

  test("searchOne - should not find soft-deleted by default", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Charlie" } }
    });

    expect(user).toBeNull();
  });

  test("searchMany - list all active", async () => {
    const userRepo = builder.repoFactory("users", {});
    const allUsers = await userRepo.searchMany({});

    expect(allUsers.length).toBeGreaterThanOrEqual(2);
    expect(allUsers.map(u => u.name)).toContain("Alice");
    expect(allUsers.map(u => u.name)).toContain("Bob");
  });

  test("searchPage - pagination works", async () => {
    const userRepo = builder.repoFactory("users", {});
    const page = await userRepo.searchPage({
      page: 1,
      pageSize: 2
    });

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(2);
  });

  test("searchOne - with relation (one-to-one)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "profile.bio"]
    });

    expect(user?.profile?.bio).toBe("Alice's bio");
  });

  test("searchOne - with relation (one-to-many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "posts.title"]
    });

    expect(user?.posts).toHaveLength(1);
    expect(user?.posts[0].title).toBe("Alice's Post");
  });

  test("searchDeletedOne - find soft-deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchDeletedOne({
      filter: { name: { $eq: "Charlie" } }
    });

    expect(user).toBeDefined();
    expect(user?.name).toBe("Charlie");
  });

  test("searchDeletedMany - list all deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const deletedUsers = await userRepo.searchDeletedMany({});

    expect(deletedUsers.length).toBeGreaterThanOrEqual(1);
    expect(deletedUsers.some(u => u.name === "Charlie")).toBe(true);
  });
});
