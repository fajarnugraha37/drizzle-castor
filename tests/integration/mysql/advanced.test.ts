import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, posts, comments, reactions, migrations } from "./schema";
import { AccessDeniedError } from "../../../src/errors";

describe("MySQL Advanced Features", () => {
  let container: StartedMySqlContainer;
  let connection: mysql.Connection;
  let db: any;
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
    db = drizzle(connection);

    // Run migrations
    for (const m of migrations) {
      await db.execute(m);
    }
  });

  after(async () => {
    if (connection) await connection.end();
    if (container) await container.stop();
  });

  test("1. RBAC Failure - Profile 'viewer' denied 'hardDelete'", async () => {
    const castor = createSchemaBuilder(db, [users] as const, "strict")
      .profiles(["viewer"] as const)
      .policies("users", {
        viewer: { allowedActions: ["read"] }
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await db.insert(users).values({ name: "To Delete", email: "del@my.com" });
    const [row] = await db.select().from(users).limit(1);

    await expect(userRepo.hardDeleteOne(row.id, "viewer")).rejects.toThrow(AccessDeniedError);
  });

  test("2. RBAC Field Protection - Unauthorized update field should be trimmed", async () => {
    const castor = createSchemaBuilder(db, [users] as const, "strict")
      .profiles(["user"] as const)
      .policies("users", {
        user: { 
          allowedActions: ["update", "read"],
          allowedSets: ["name"]
        }
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await db.insert(users).values({ name: "Alice MY", email: "alice@my.com", age: 20 });
    const [alice] = await db.select().from(users).where(sql`name = 'Alice MY'`);

    const updated = await userRepo.updateOne(alice.id, { name: "Alice Updated", age: 99 } as any, "user");

    expect(updated?.name).toBe("Alice Updated");
    expect(updated?.age).toBe(20);
  });

  test("3. RBAC Transaction Rollback - Violation mid-TX should revert everything", async () => {
    const castor = createSchemaBuilder(db, [users] as const, "strict")
      .profiles(["user"] as const)
      .policies("users", {
        user: { 
          allowedActions: ["update", "read"], 
          allowedSets: ["name"] 
        }
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await db.insert(users).values({ name: "Bob MY", email: "bob@my.com" });
    const [bob] = await db.select().from(users).where(sql`name = 'Bob MY'`);

    let caughtError: any = null;
    try {
      await castor.transaction(async (txInstance: any) => {
        const txUserRepo = txInstance.repoFactory("users");
        await txUserRepo.updateOne(bob.id, { name: "Valid MY Change" }, "user");
        await txUserRepo.hardDeleteOne(bob.id, "user");
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(AccessDeniedError);

    const [currentBob] = await db.select().from(users).where(sql`id = ${bob.id}`);
    expect(currentBob.name).toBe("Bob MY");
  });

  test("4 & 5. Middleware Order and State Persistence", async () => {
    const executionLog: string[] = [];

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
        executionLog.push("mw1_start");
        ctx.state.sharedValue = "my_hello";
        const res = await next();
        executionLog.push("mw1_end");
        return res;
      })
      .use(async (ctx, next) => {
        executionLog.push("mw2_start");
        if (ctx.state.sharedValue === "my_hello") executionLog.push("state_persisted");
        const res = await next();
        executionLog.push("mw2_end");
        return res;
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await userRepo.searchMany({ limit: 1 });

    expect(executionLog).toEqual([
      "mw1_start", 
      "mw2_start", 
      "state_persisted", 
      "mw2_end", 
      "mw1_end"
    ]);
  });

  test("6 & 7. Telemetry Events and Trace ID Linking", async () => {
    let capturedEvent: any = null;
    let middlewareTraceId: string = "";

    const builderObj = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
        middlewareTraceId = ctx.traceId;
        return next();
      });

    builderObj.on("execution", (ev) => {
      capturedEvent = ev;
    });

    const castor = builderObj.build();
    const userRepo = castor.repoFactory("users");
    
    await userRepo.searchMany({ filter: { name: { $eq: "Alice MY" } } });

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.action).toBe("read");
    expect(capturedEvent.traceId).toBe(middlewareTraceId);
  });

  test("8. Deep Joining (Level 3 - Users -> Posts -> Comments -> Reactions)", async () => {
    const castor = createSchemaBuilder(db, [users, posts, comments, reactions] as const, "lenient")
      .table("users", {
        oneToMany: [{ relationName: "posts", relatedTable: "posts", localKey: "users.id", foreignKey: "posts.authorId" }]
      })
      .table("posts", {
        oneToMany: [{ relationName: "comments", relatedTable: "comments", localKey: "posts.id", foreignKey: "comments.postId" }]
      })
      .table("comments", {
        oneToMany: [{ relationName: "reactions", relatedTable: "reactions", localKey: "comments.id", foreignKey: "reactions.commentId" }]
      })
      .build();

    const userRepo = castor.repoFactory("users");

    // Seed Data
    await db.insert(users).values({ name: "Deep User MY", email: "deep@my.com" });
    const [u] = await db.select().from(users).where(sql`name = 'Deep User MY'`);
    
    await db.insert(posts).values({ title: "Deep Post MY", authorId: u.id });
    const [p] = await db.select().from(posts).where(sql`title = 'Deep Post MY'`);

    await db.insert(comments).values({ content: "Deep Comment MY", postId: p.id });
    const [c] = await db.select().from(comments).where(sql`content = 'Deep Comment MY'`);

    await db.insert(reactions).values({ type: "⭐", commentId: c.id });

    const result = await userRepo.searchOne({
      filter: { "posts.comments.reactions.type": { $eq: "⭐" } },
      projection: ["id", "name", "posts.comments.reactions.type"]
    });

    expect(result).toBeDefined();
    expect(result?.posts[0].comments[0].reactions[0].type).toBe("⭐");
  });

  test("9. Custom TraceID Generator", async () => {
    let capturedTraceId: string = "";

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .withTraceIdGenerator(() => "MY-CUSTOM-1337")
      .use(async (ctx, next) => {
        capturedTraceId = ctx.traceId;
        return next();
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await userRepo.searchMany({ limit: 1 });

    expect(capturedTraceId).toBe("MY-CUSTOM-1337");
  });
});
