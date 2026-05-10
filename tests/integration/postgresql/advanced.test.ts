import { describe, test, before, after } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, posts, comments, reactions, migrations } from "./schema";
import { AccessDeniedError } from "../../../src/errors";

describe("PostgreSQL Advanced Features", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: any;
  let builder: any;

  before(async () => {
    container = await new PostgreSqlContainer("postgres:15")
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
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool);

    // Run migrations
    for (const m of migrations) {
      await db.execute(m);
    }
  });

  after(async () => {
    if (pool) await pool.end();
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
    const [row] = await db.insert(users).values({ name: "To Delete", email: "del@pg.com" }).returning();

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
    const [alice] = await db.insert(users).values({ name: "Alice PG", email: "alice@pg.com", age: 20 }).returning();

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
    const [bob] = await db.insert(users).values({ name: "Bob PG", email: "bob@pg.com" }).returning();

    let caughtError: any = null;
    try {
      await castor.transaction(async (txInstance: any) => {
        const txUserRepo = txInstance.repoFactory("users");
        await txUserRepo.updateOne(bob.id, { name: "Valid PG Change" }, "user");
        await txUserRepo.hardDeleteOne(bob.id, "user");
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(AccessDeniedError);

    const [currentBob] = await db.select().from(users).where(sql`id = ${bob.id}`);
    expect(currentBob.name).toBe("Bob PG");
  });

  test("4 & 5. Middleware Order and State Persistence", async () => {
    const executionLog: string[] = [];

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
        executionLog.push("mw1_start");
        ctx.state.sharedValue = "pg_hello";
        const res = await next();
        executionLog.push("mw1_end");
        return res;
      })
      .use(async (ctx, next) => {
        executionLog.push("mw2_start");
        if (ctx.state.sharedValue === "pg_hello") executionLog.push("state_persisted");
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
    
    await userRepo.searchMany({ filter: { name: { $eq: "Alice PG" } } });

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
    const [u] = await db.insert(users).values({ name: "Deep User PG", email: "deep@pg.com" }).returning();
    const [p] = await db.insert(posts).values({ title: "Deep Post PG", authorId: u.id }).returning();
    const [c] = await db.insert(comments).values({ content: "Deep Comment PG", postId: p.id }).returning();
    await db.insert(reactions).values({ type: "🚀", commentId: c.id });

    const result = await userRepo.searchOne({
      filter: { "posts.comments.reactions.type": { $eq: "🚀" } },
      projection: ["id", "name", "posts.comments.reactions.type"]
    });

    expect(result).toBeDefined();
    expect(result?.posts[0].comments[0].reactions[0].type).toBe("🚀");
  });

  test("9. Custom TraceID Generator", async () => {
    let capturedTraceId: string = "";

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .withTraceIdGenerator(() => "PG-CUSTOM-ID")
      .use(async (ctx, next) => {
        capturedTraceId = ctx.traceId;
        return next();
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await userRepo.searchMany({ limit: 1 });

    expect(capturedTraceId).toBe("PG-CUSTOM-ID");
  });
});
