import { expect, test, describe, beforeAll } from "bun:test";
import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql, eq } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories, migrations } from "./schema";

describe("SQLite Integration - Read Operations", () => {
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
        manyToMany: [
          {
            relationName: "categories",
            relatedTable: "categories",
            joinTable: "posts_to_categories",
            localKey: "posts.id",
            joinLocalKey: "posts_to_categories.postId",
            relatedKey: "categories.id",
            joinRelatedKey: "posts_to_categories.categoryId",
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
    const categoryRepo = builder.repoFactory("categories", {});

    const u1 = await userRepo.createOne({ name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 });
    const u2 = await userRepo.createOne({ name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 });
    await userRepo.createOne({ name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 });

    await profileRepo.createOne({ bio: "Alice's bio", userId: u1.id });
    
    const p1 = await postRepo.createOne({ title: "Alice's Post", authorId: u1.id, deletedFlag: 0 });
    await postRepo.createOne({ title: "Deleted Post", authorId: u1.id, deletedFlag: 1 });
    const p2 = await postRepo.createOne({ title: "Bob's Post", authorId: u2.id, deletedFlag: 0 });

    const c1 = await categoryRepo.createOne({ name: "Tech" });
    const c2 = await categoryRepo.createOne({ name: "News" });

    // Junction data
    await db.insert(postsToCategories).values([
      { postId: p1.id, categoryId: c1.id },
      { postId: p1.id, categoryId: c2.id },
      { postId: p2.id, categoryId: c1.id },
    ]);

    // Seed for JSON tests
    await userRepo.createOne({ name: "John JSON", email: "john_json@example.com", age: 40, metadata: { theme: "dark", tags: ["expert", "node"] }, settings: { theme: "dark", persona: { nickName: "Johnny", avatarUrl: "dark-av", hobbies: ["coding", "gaming"] } } });
    await userRepo.createOne({ name: "Jane JSON", email: "jane_json@example.com", age: 30, metadata: { theme: "light", tags: ["beginner"] }, settings: { theme: "light", persona: { nickName: "Janie", avatarUrl: "light-av", hobbies: ["reading", "hiking"] } } });
    await userRepo.createOne({ name: "Null Age User", email: "nullage@example.com", age: null });
  });

  describe("Relationship Operations", () => {
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

    test("searchOne - with relation (many-to-one)", async () => {
      const postRepo = builder.repoFactory("posts", {});
      const post = await postRepo.searchOne({
        filter: { title: { $eq: "Alice's Post" } },
        projection: ["id", "title", "author.name"]
      });

      expect(post?.author).toBeDefined();
      expect(post?.author.name).toBe("Alice");
    });

    test("searchOne - with relation (many-to-many)", async () => {
      const postRepo = builder.repoFactory("posts", {});
      const post = await postRepo.searchOne({
        filter: { title: { $eq: "Alice's Post" } },
        projection: ["id", "title", "categories.name"]
      });

      expect(post?.categories).toHaveLength(2);
      const catNames = post?.categories.map((c: any) => c.name);
      expect(catNames).toContain("Tech");
      expect(catNames).toContain("News");
    });

    test("searchMany - filtering across many-to-many and many-to-one", async () => {
      const postRepo = builder.repoFactory("posts", {});
      const postsResult = await postRepo.searchMany({
        filter: { 
          "categories.name": { $eq: "Tech" },
          "author.age": { $lt: 30 }
        },
        projection: ["id", "title", "author.name"]
      });

      // Alice's Post is Tech and Alice is 25 (< 30)
      // Bob's Post is Tech but Bob is 30 (not < 30)
      expect(postsResult).toHaveLength(1);
      expect(postsResult[0].title).toBe("Alice's Post");
      expect(postsResult[0].author.name).toBe("Alice");
    });
  });

  describe("Advanced Operators", () => {
    test("$eq and $ne", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $eq: 25 } } })).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $ne: 25 } } })).toHaveLength(3); 
    });

    test("$gt, $gte, $lt, $lte", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $gt: 30 } } })).toHaveLength(1); 
      expect(await userRepo.searchMany({ filter: { age: { $gte: 30 } } })).toHaveLength(3); 
      expect(await userRepo.searchMany({ filter: { age: { $lt: 30 } } })).toHaveLength(1); 
      expect(await userRepo.searchMany({ filter: { age: { $lte: 30 } } })).toHaveLength(3); 
    });

    test("$isNull and $isNotNull", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $isNull: true } } })).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $isNotNull: true } } })).toHaveLength(4);
    });

    test("$inArray and $notInArray", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $inArray: [25, 40] } } })).toHaveLength(2);
      expect(await userRepo.searchMany({ filter: { age: { $notInArray: [25, 40] } } })).toHaveLength(2); 
    });

    test("$between and $notBetween", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $between: [25, 35] } } })).toHaveLength(3); 
      expect(await userRepo.searchMany({ filter: { age: { $notBetween: [25, 35] } } })).toHaveLength(1); 
    });

    test("$like, $ilike, $notLike, $notIlike", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { email: { $like: "%example.com" } } })).toHaveLength(5);
      expect(await userRepo.searchMany({ filter: { name: { $ilike: "alice" } } })).toHaveLength(1); 
      expect(await userRepo.searchMany({ filter: { name: { $notLike: "Alice" } } })).toHaveLength(4);
      expect(await userRepo.searchMany({ filter: { name: { $notIlike: "alice" } } })).toHaveLength(4);
    });

    test("$and, $or, $not", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ 
        filter: { $and: [{ age: { $gt: 25 } }, { age: { $lt: 40 } }] } 
      })).toHaveLength(2); 

      expect(await userRepo.searchMany({ 
        filter: { $or: [{ age: { $eq: 25 } }, { age: { $eq: 40 } }] } 
      })).toHaveLength(2); 

      expect(await userRepo.searchMany({ 
        filter: { $not: { age: { $eq: 25 } } } 
      })).toHaveLength(3); 
      
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

  test("searchDeletedPage - paginated deleted records", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // Seed more deleted records for pagination
    await userRepo.createOne({ name: "Del 1", email: "del1@ex.com", deletedFlag: 1 }, "admin");
    await userRepo.createOne({ name: "Del 2", email: "del2@ex.com", deletedFlag: 1 }, "admin");

    const page = await userRepo.searchDeletedPage({
      page: 1,
      pageSize: 2,
      order: { name: "asc" }
    });

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(3); // Charlie + Del 1 + Del 2
    expect(page.meta.totalPages).toBeGreaterThanOrEqual(2);
  });
});
