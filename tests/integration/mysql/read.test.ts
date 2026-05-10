import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, eq } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, profiles, posts, categories, postsToCategories, migrations } from "./schema";

describe("MySQL Integration - Read Operations", () => {
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
    connection = await mysql.createConnection({
      uri: container.getConnectionUri(),
      multipleStatements: true,
    });
    db = drizzle(connection, {
      logger: true,
    });

    for (const migration of migrations) {
      await db.execute(migration);
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

    const newUser1 = await userRepo.createOne({ name: "Alice", email: "alice@example.com", age: 25, deletedFlag: 0 }, "admin");
    const newUser2 = await userRepo.createOne({ name: "Bob", email: "bob@example.com", age: 30, deletedFlag: 0 }, "admin");
    await userRepo.createOne({ name: "Charlie", email: "charlie@example.com", age: 35, deletedFlag: 1 }, "admin"); // Soft deleted

    await profileRepo.createOne({ bio: "Alice's bio", userId: newUser1.id }, "admin");

    const post1 = await postRepo.createOne({ title: "Alice's Post", content: "Hello world", authorId: newUser1.id, deletedFlag: 0 }, "admin");
    await postRepo.createOne({ title: "Deleted Post", content: "Bye world", authorId: newUser1.id, deletedFlag: 1 }, "admin");
    const post2 = await postRepo.createOne({ title: "Bob's Post", content: "MySQL/PG test", authorId: newUser2.id, deletedFlag: 0 }, "admin");

    const cat1 = await categoryRepo.createOne({ name: "Tech" }, "admin");
    const cat2 = await categoryRepo.createOne({ name: "News" }, "admin");

    // Junction data
    await db.insert(postsToCategories).values([
      { postId: post1.id, categoryId: cat1.id },
      { postId: post1.id, categoryId: cat2.id },
      { postId: post2.id, categoryId: cat1.id },
    ]);

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

  describe("Relationship Operations", () => {
    test("searchOne - with relation (one-to-one)", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { name: { $eq: "Alice" } },
        projection: ["id", "name", "profile.bio"]
      }, "admin");

      expect(user).toBeDefined();
      expect(user?.profile).toBeDefined();
      expect(user?.profile.bio).toBe("Alice's bio");
    });

    test("searchOne - with relation (one-to-many)", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { name: { $eq: "Alice" } },
        projection: ["id", "name", "posts.title"]
      }, "admin");

      expect(user).toBeDefined();
      expect(user?.posts).toBeDefined();
      expect(user?.posts).toHaveLength(1); // Only active posts
      expect(user?.posts[0].title).toBe("Alice's Post");
    });

    test("searchOne - with relation (many-to-one)", async () => {
      const postRepo = builder.repoFactory("posts", {});
      const post = await postRepo.searchOne({
        filter: { title: { $eq: "Alice's Post" } },
        projection: ["id", "title", "author.name"]
      }, "admin");

      expect(post).toBeDefined();
      expect(post?.author).toBeDefined();
      expect(post?.author.name).toBe("Alice");
    });

    test("searchOne - with relation (many-to-many)", async () => {
      const postRepo = builder.repoFactory("posts", {});
      const post = await postRepo.searchOne({
        filter: { title: { $eq: "Alice's Post" } },
        projection: ["id", "title", "categories.name"]
      }, "admin");

      expect(post).toBeDefined();
      expect(post?.categories).toBeDefined();
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
      }, "admin");

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
      expect(await userRepo.searchMany({ filter: { age: { $eq: 25 } } }, "admin")).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $ne: 25 } } }, "admin")).toHaveLength(3); 
    });

    test("$gt, $gte, $lt, $lte", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $gt: 30 } } }, "admin")).toHaveLength(1); 
      expect(await userRepo.searchMany({ filter: { age: { $gte: 30 } } }, "admin")).toHaveLength(3); 
      expect(await userRepo.searchMany({ filter: { age: { $lt: 30 } } }, "admin")).toHaveLength(1); 
      expect(await userRepo.searchMany({ filter: { age: { $lte: 30 } } }, "admin")).toHaveLength(3); 
    });

    test("$isNull and $isNotNull", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $isNull: true } } }, "admin")).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { age: { $isNotNull: true } } }, "admin")).toHaveLength(4);
    });

    test("$inArray and $notInArray", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $inArray: [25, 40] } } }, "admin")).toHaveLength(2);
      expect(await userRepo.searchMany({ filter: { age: { $notInArray: [25, 40] } } }, "admin")).toHaveLength(2); 
    });

    test("$between and $notBetween", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { age: { $between: [25, 35] } } }, "admin")).toHaveLength(3); 
      expect(await userRepo.searchMany({ filter: { age: { $notBetween: [25, 35] } } }, "admin")).toHaveLength(1); 
    });

    test("$like, $ilike, $notLike, $notIlike", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { email: { $like: "%example.com" } } }, "admin")).toHaveLength(5);
      expect(await userRepo.searchMany({ filter: { name: { $ilike: "alice" } } }, "admin")).toHaveLength(1);
      expect(await userRepo.searchMany({ filter: { name: { $notLike: "Alice" } } }, "admin")).toHaveLength(4);
      expect(await userRepo.searchMany({ filter: { name: { $notIlike: "alice" } } }, "admin")).toHaveLength(4);
    });

    test("$arrayContains (MySQL specific)", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ filter: { "metadata.tags": { $arrayContains: ["expert"] } } as any }, "admin")).toHaveLength(1);
    });

    test("$and, $or, $not", async () => {
      const userRepo = builder.repoFactory("users", {});
      expect(await userRepo.searchMany({ 
        filter: { $and: [{ age: { $gt: 25 } }, { age: { $lt: 40 } }] } 
      }, "admin")).toHaveLength(2); 

      expect(await userRepo.searchMany({ 
        filter: { $or: [{ age: { $eq: 25 } }, { age: { $eq: 40 } }] } 
      }, "admin")).toHaveLength(2); 

      expect(await userRepo.searchMany({ 
        filter: { $not: { age: { $eq: 25 } } } 
      }, "admin")).toHaveLength(3); 
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

      expect(usersResult[0].name).toBe("John JSON"); 
      expect(usersResult[1].name).toBe("Jane JSON");
    });

    test("searchMany - JSON array index access (.1) in projection", async () => {
      const userRepo = builder.repoFactory("users", {});
      const user = await userRepo.searchOne({
        filter: { name: { $eq: "John JSON" } },
        projection: ["id", "settings.persona.hobbies.1"]
      }, "admin");

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

      expect(usersResult[0].name).toBe("John JSON");
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

  test("searchDeletedPage - paginated deleted records", async () => {
    const userRepo = builder.repoFactory("users", {});
    
    // Seed more deleted records for pagination
    await userRepo.createOne({ name: "Del 1", email: "del1@ex.com", deletedFlag: 1, deletedAt: new Date() }, "admin");
    await userRepo.createOne({ name: "Del 2", email: "del2@ex.com", deletedFlag: 1, deletedAt: new Date() }, "admin");

    const page = await userRepo.searchDeletedPage({
      page: 1,
      pageSize: 2,
      order: { name: "asc" }
    }, "admin");

    expect(page.data).toHaveLength(2);
    expect(page.meta.totalItems).toBeGreaterThanOrEqual(3); // Charlie + Del 1 + Del 2
    expect(page.meta.totalPages).toBeGreaterThanOrEqual(2);
  });
});
