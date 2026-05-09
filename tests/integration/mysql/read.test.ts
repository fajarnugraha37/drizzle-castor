import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories } from "./schema";

describe("MySQL Integration - Read Operations", () => {
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

    await db.execute(sql`
      CREATE TABLE profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bio TEXT,
        user_id INT NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE TABLE posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        author_id INT,
        deleted_flag INT DEFAULT 0
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

    // Seed data using repoFactory for better hydration control
    const userRepo = builder.repoFactory("users", {});
    const profileRepo = builder.repoFactory("profiles", {});
    const postRepo = builder.repoFactory("posts", {});

    await userRepo.createOne({ name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 }, "admin");
    await userRepo.createOne({ name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 }, "admin");
    await userRepo.createOne({ name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 }, "admin");

    const alice = await userRepo.searchOne({ filter: { name: { $eq: "Alice" } } }, "admin");
    
    await profileRepo.createOne({ bio: "Alice's bio", userId: alice!.id }, "admin");

    await postRepo.createOne({ title: "Alice's Post", content: "Hello world", authorId: alice!.id, deletedFlag: 0 }, "admin");
    await postRepo.createOne({ title: "Deleted Post", content: "Bye world", authorId: alice!.id, deletedFlag: 1 }, "admin");

    // Seed for JSON tests
    await userRepo.createOne({ 
      name: "John JSON", 
      email: "john_json@example.com", 
      age: 40, 
      metadata: { theme: "dark", tags: ["expert", "node"] },
      settings: { theme: "dark", persona: { nickName: "Johnny", avatarUrl: "dark-av", hobbies: ["coding", "gaming"] } }
    }, "admin");
    await userRepo.createOne({ 
      name: "Jane JSON", 
      email: "jane_json@example.com", 
      age: 30, 
      metadata: { theme: "light", tags: ["beginner"] },
      settings: { theme: "light", persona: { nickName: "Janie", avatarUrl: "light-av", hobbies: ["reading", "hiking"] } }
    }, "admin");
    await userRepo.createOne({ name: "Null Age User", email: "nullage@example.com", age: null }, "admin");
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  describe("Advanced Operators", () => {
    test("$eq and $ne", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $eq: 25 } } }, "admin")).toHaveLength(1);
      // NOTE: Standard SQL excludes NULL from <> comparison.
      // Active: Alice(25), Bob(30), John(40), Jane(30), Null(null)
      // $ne 25 -> Bob, John, Jane. (Total 3)
      expect(await userRepo.searchMany({ filter: { age: { $ne: 25 } } }, "admin")).toHaveLength(3); 
    });

    test("$gt, $gte, $lt, $lte", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $gt: 30 } } }, "admin")).toHaveLength(1); // John(40)
      expect(await userRepo.searchMany({ filter: { age: { $gte: 30 } } }, "admin")).toHaveLength(3); // Bob(30), John(40), Jane(30)
      expect(await userRepo.searchMany({ filter: { age: { $lt: 30 } } }, "admin")).toHaveLength(1); // Alice(25)
      expect(await userRepo.searchMany({ filter: { age: { $lte: 30 } } }, "admin")).toHaveLength(3); // Alice(25), Bob(30), Jane(30)
    });

    test("$isNull and $isNotNull", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $isNull: true } } }, "admin")).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $isNotNull: true } } }, "admin")).toHaveLength(4);
    });

    test("$inArray and $notInArray", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $inArray: [25, 40] } } }, "admin")).toHaveLength(2);
      expect(await userRepo.searchMany({ filter: { age: { $notInArray: [25, 40] } } }, "admin")).toHaveLength(2); // Bob(30), Jane(30). Null excluded.
    });

    test("$between and $notBetween", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $between: [25, 35] } } }, "admin")).toHaveLength(3); // Alice, Bob, Jane
      expect(await userRepo.searchMany({ filter: { age: { $notBetween: [25, 35] } } }, "admin")).toHaveLength(1); // John(40)
    });

    test("$like, $ilike, $notLike, $notIlike", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { email: { $like: "%example.com" } } }, "admin")).toHaveLength(5);
      expect(await userRepo.searchMany({ filter: { name: { $ilike: "alice" } } }, "admin")).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { name: { $notLike: "Alice" } } }, "admin")).toHaveLength(4);
      expect(await userRepo.searchMany({ filter: { name: { $notIlike: "alice" } } }, "admin")).toHaveLength(4);
    });

    test("$arrayContains, $arrayContained, $arrayOverlaps (MySQL JSON ops)", async () => {
      const userRepo = builder.repoFactory("users", {});
      // MySQL supports JSON_CONTAINS
      expect(await userRepo.searchMany({ filter: { "metadata.tags": { $arrayContains: ["expert"] } } as any }, "admin")).toHaveLength(1);
    });

    test("$and, $or, $not", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ 
        filter: { $and: [{ age: { $gt: 25 } }, { age: { $lt: 40 } }] } 
      }, "admin")).toHaveLength(2); // Bob(30), Jane(30)

      expect(await userRepo.searchMany({ 
        filter: { $or: [{ age: { $eq: 25 } }, { age: { $eq: 40 } }] } 
      }, "admin")).toHaveLength(2); // Alice(25), John(40)

      expect(await userRepo.searchMany({ 
        filter: { $not: { age: { $eq: 25 } } } 
      }, "admin")).toHaveLength(3); // Bob, John, Jane. (Null excluded)
    });
  });

  describe("Complex JSON Operations", () => {
    test("searchOne - JSON path nested level 2 in projection", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { "settings.persona.nickName": { $eq: "Johnny" } },
        projection: ["id", "settings.persona.nickName"]
      }, "admin");

      expect(user?.settings?.persona?.nickName).toBe("Johnny");
      expect(user?.settings?.persona?.avatarUrl).toBeUndefined();
    });

    test("searchMany - JSON path nested level 2 in filter", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { "settings.persona.avatarUrl": { $eq: "light-av" } }
      }, "admin");

      expect(usersResult).toHaveLength(1);
      expect(usersResult[0].name).toBe("Jane JSON");
    });

    test("searchMany - JSON path nested level 2 in order", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { name: { $like: "%JSON" } },
        order: { "settings.persona.nickName": "desc" }
      }, "admin");

      expect(usersResult[0].name).toBe("John JSON"); // "Johnny" > "Janie"
      expect(usersResult[1].name).toBe("Jane JSON");
    });

    test("searchMany - JSON array index access (.1) in projection", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { name: { $eq: "John JSON" } },
        projection: ["id", "settings.persona.hobbies.1"]
      }, "admin");

      // John JSON hobbies: ["coding", "gaming"] -> index 1 is "gaming"
      expect(user?.settings?.persona?.hobbies).toEqual([undefined, "gaming"]); 
    });

    test("searchMany - JSON array index access (.1) in filter", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { "settings.persona.hobbies.1": { $eq: "hiking" } }
      }, "admin");

      expect(usersResult).toHaveLength(1);
      expect(usersResult[0].name).toBe("Jane JSON");
    });

    test("searchMany - JSON array index access (.1) in order", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        filter: { name: { $like: "%JSON" } },
        order: { "settings.persona.hobbies.1": "asc" } 
      }, "admin");

      expect(usersResult[0].name).toBe("John JSON"); // "gaming" < "hiking"
      expect(usersResult[1].name).toBe("Jane JSON");
    });
  });

  describe("Aggregates and Ordering", () => {
    test("searchMany - aggregate in order on normal column", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        order: { age: { direction: "desc", aggregate: "max" } }
      }, "admin");
      expect(usersResult).toBeDefined();
    });

    test("searchMany - aggregate in order on JSON column", async () => {
      const userRepo = builder.repoFactory("users", {});
      const usersResult = await userRepo.searchMany({
        order: { "settings.theme": { direction: "asc", aggregate: "min" } }
      }, "admin");
      expect(usersResult).toBeDefined();
    });

    test("searchMany - nulls first/last", async () => {
      const userRepo = builder.repoFactory("users", {});
      
      const first = await userRepo.searchMany({
        order: { age: { direction: "asc", nulls: "first" } }
      }, "admin");
      expect(first[0].age).toBeNull();

      const last = await userRepo.searchMany({
        order: { age: { direction: "asc", nulls: "last" } }
      }, "admin");
      expect(last[last.length - 1].age).toBeNull();
    });
  });

  test("searchPage - with JSON nested path in everything", async () => {
    const userRepo = builder.repoFactory("users", {});
    const page = await userRepo.searchPage({
      page: 1,
      pageSize: 10,
      filter: { "settings.persona.nickName": { $like: "J%" } },
      projection: ["id", "name", "settings.persona.nickName", "settings.persona.hobbies.0"],
      order: { "settings.persona.nickName": "desc" }
    }, "admin");

    expect(page.data).toHaveLength(2);
    expect(page.data[0].settings.persona.nickName).toBe("Johnny");
    expect(page.data[0].settings.persona.hobbies).toEqual(["coding"]);
  });

  test("searchOne - basic find", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } }
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.name).toBe("Alice");
  });

  test("searchOne - should not find soft-deleted by default", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Charlie" } }
    }, "admin");

    expect(user).toBeNull();
  });

  test("searchMany - list all active", async () => {
    const userRepo = builder.repoFactory("users", {});
    const allUsers = await userRepo.searchMany({}, "admin");

    expect(allUsers.length).toBeGreaterThanOrEqual(2);
    expect(allUsers.map(u => u.name)).toContain("Alice");
    expect(allUsers.map(u => u.name)).toContain("Bob");
  });

  test("searchPage - pagination works", async () => {
    const userRepo = builder.repoFactory("users", {});
    const page = await userRepo.searchPage({
      page: 1,
      pageSize: 2
    }, "admin");

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(2);
  });

  test("searchOne - with relation (one-to-one)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "profile.bio"]
    }, "admin");

    expect(user?.profile?.bio).toBe("Alice's bio");
  });

  test("searchOne - with relation (one-to-many)", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchOne({
      filter: { name: { $eq: "Alice" } },
      projection: ["id", "name", "posts.title"]
    }, "admin");

    expect(user?.posts).toHaveLength(1);
    expect(user?.posts[0].title).toBe("Alice's Post");
  });

  test("searchDeletedOne - find soft-deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const user = await userRepo.searchDeletedOne({
      filter: { name: { $eq: "Charlie" } }
    }, "admin");

    expect(user).toBeDefined();
    expect(user?.name).toBe("Charlie");
  });

  test("searchDeletedMany - list all deleted", async () => {
    const userRepo = builder.repoFactory("users", {});
    const deletedUsers = await userRepo.searchDeletedMany({}, "admin");

    expect(deletedUsers.length).toBeGreaterThanOrEqual(1);
    expect(deletedUsers.some(u => u.name === "Charlie")).toBe(true);
  });
});
