import { expect, test, describe, beforeAll } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, posts, comments, reactions, migrations } from "./schema";
import { AccessDeniedError } from "../../../src/errors";

describe("SQLite Advanced Features", () => {
  let db: any;
  let builder: any;

  beforeAll(async () => {
    const sqlite = new Database(":memory:");
    db = drizzle(sqlite);
    
    // Run migrations
    for (const m of migrations) {
      db.run(m);
    }
  });

  test("1. RBAC Failure - Profile 'viewer' denied 'hardDelete'", async () => {
    const castor = createSchemaBuilder(db, [users] as const, "strict")
      .profiles(["viewer"] as const)
      .policies("users", {
        viewer: { allowedActions: ["read"] }
      })
      .build();

    const userRepo = castor.repoFactory("users");
    // Seed a user
    await db.insert(users).values({ name: "To Delete", email: "del@ex.com" });
    const [row] = await db.select().from(users).limit(1);

    await expect(userRepo.hardDeleteOne(row.id, "viewer")).rejects.toThrow(AccessDeniedError);
  });

  test("2. RBAC Field Protection - Unauthorized update field should be trimmed", async () => {
    const castor = createSchemaBuilder(db, [users] as const, "strict")
      .profiles(["user"] as const)
      .policies("users", {
        user: { 
          allowedActions: ["update", "read"],
          allowedSets: ["name"] // 'age' and 'email' NOT allowed
        }
      })
      .build();

    const userRepo = castor.repoFactory("users");
    const [alice] = await db.insert(users).values({ name: "Alice", email: "alice@ex.com", age: 20 }).returning();

    // Attempt to update name (allowed) and age (denied)
    // We expect a warning in logs, and age to be ignored.
    const updated = await userRepo.updateOne(alice.id, { name: "Alice Updated", age: 99 } as any, "user");

    expect(updated?.name).toBe("Alice Updated");
    expect(updated?.age).toBe(20); // Remained 20, was NOT updated to 99
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
    const [bob] = await db.insert(users).values({ name: "Bob", email: "bob@ex.com" }).returning();

    let caughtError: any = null;
    try {
      // Use Castor's transaction for automatic context propagation
      await castor.transaction(async (txInstance: any) => {
        const txUserRepo = txInstance.repoFactory("users");
        
        // 1. Valid update
        await txUserRepo.updateOne(bob.id, { name: "Valid Change" }, "user");
        
        // 2. Trigger RBAC violation (hardDelete not allowed for 'user')
        await txUserRepo.hardDeleteOne(bob.id, "user");
      });
    } catch (e) {
      caughtError = e;
    }

    expect(caughtError).toBeInstanceOf(AccessDeniedError);

    // Verify Bob's name was NOT changed due to rollback
    const [currentBob] = await db.select().from(users).where(sql`id = ${bob.id}`);
    expect(currentBob.name).toBe("Bob");
  });

  test("4 & 5. Middleware Order and State Persistence", async () => {
    const executionLog: string[] = [];

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
        executionLog.push("mw1_start");
        ctx.state.sharedValue = "hello";
        const res = await next();
        executionLog.push("mw1_end");
        return res;
      })
      .use(async (ctx, next) => {
        executionLog.push("mw2_start");
        // Check state persistence from mw1
        if (ctx.state.sharedValue === "hello") executionLog.push("state_persisted");
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
    
    await userRepo.searchMany({ filter: { name: { $eq: "Alice" } } });

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.action).toBe("read");
    expect(capturedEvent.tableName).toBe("users");
    expect(capturedEvent.traceId).toBe(middlewareTraceId); // Linking check
    expect(capturedEvent.duration).toBeGreaterThanOrEqual(0);
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
    const [u] = await db.insert(users).values({ name: "Deep User", email: "deep@ex.com" }).returning();
    const [p] = await db.insert(posts).values({ title: "Deep Post", authorId: u.id }).returning();
    const [c] = await db.insert(comments).values({ content: "Deep Comment", postId: p.id }).returning();
    await db.insert(reactions).values({ type: "🔥", commentId: c.id });

    const result = await userRepo.searchOne({
      filter: { "posts.comments.reactions.type": { $eq: "🔥" } },
      projection: ["id", "name", "posts.comments.reactions.type"]
    });

    expect(result).toBeDefined();
    expect(result?.posts[0].comments[0].reactions[0].type).toBe("🔥");
  });

  test("9. Custom TraceID Generator", async () => {
    let capturedTraceId: string = "";

    const castor = createSchemaBuilder(db, [users] as const, "lenient")
      .withTraceIdGenerator(() => "REQ-LOCKED-007")
      .use(async (ctx, next) => {
        capturedTraceId = ctx.traceId;
        return next();
      })
      .build();

    const userRepo = castor.repoFactory("users");
    await userRepo.searchMany({ limit: 1 });

    expect(capturedTraceId).toBe("REQ-LOCKED-007");
  });
});
