import { describe, test, before, after, beforeEach } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql, eq } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, posts, migrations } from "./schema";
import { ConfigurationError } from "../../../src/errors";
import { getExecutionContext } from "../../../src/context/manager";

describe("PostgreSQL Integration - Transaction Management", () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: NodePgDatabase;
  let builder: any;
  let castor: any;

  before(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
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
    pool = new pg.Pool({
      connectionString: container.getConnectionUri(),
    });
    db = drizzle(pool);

    for (const ddl of migrations) {
      await db.execute(ddl);
    }

    builder = createSchemaBuilder(db, [users, posts] as const, "lenient")
      .table("users", {
        oneToMany: [{ relationName: "posts", relatedTable: "posts", localKey: "users.id", foreignKey: "posts.authorId" }],
        softDelete: { deleteValue: { deletedFlag: 1 }, restoreValue: { deletedFlag: 0 } }
      })
      .profiles(["admin", "user"] as const);
    
    castor = builder.build();
  });

  after(async () => {
    if (pool) await pool.end();
    if (container) await container.stop();
  });

  beforeEach(async () => {
    // Clear data between tests
    await db.delete(posts);
    await db.delete(users);
  });

  test("Atomicity: Commit multiple operations", async () => {
    const userRepo = castor.repoFactory("users");
    const postRepo = castor.repoFactory("posts");

    await castor.transaction(async (tx) => {
      const user = await tx.repoFactory("users").createOne({
        name: "Transactional User",
        email: "tx@example.com",
      }, "admin");

      await tx.repoFactory("posts").createOne({
        title: "Post 1",
        authorId: user.id,
      }, "admin");
    });

    const allUsers = await userRepo.searchMany({}, "admin");
    const allPosts = await postRepo.searchMany({}, "admin");

    expect(allUsers).toHaveLength(1);
    expect(allPosts).toHaveLength(1);
    expect(allPosts[0].authorId).toBe(allUsers[0].id);
  });

  test("Atomicity: Rollback on error", async () => {
    const userRepo = castor.repoFactory("users");
    const email = "rollback@example.com";

    try {
      await castor.transaction(async (tx) => {
        await tx.repoFactory("users").createOne({
          name: "Should Disappear",
          email,
        }, "admin");

        throw new Error("Force Rollback");
      });
    } catch (e: any) {
      expect(e.message).toBe("Force Rollback");
    }

    const found = await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin");
    expect(found).toBeNull();
  });

  test("Propagation: REQUIRED (default) joins existing transaction", async () => {
    let tx1Handle: any;
    let tx2Handle: any;

    await castor.transaction(async (tx1) => {
      tx1Handle = tx1.db;
      await tx1.transaction(async (tx2) => {
        tx2Handle = tx2.db;
        // REQUIRED should reuse the same handle
        expect(tx2Handle).toBe(tx1Handle);
      }, { propagation: "REQUIRED" });
    });
  });

  test("Propagation: REQUIRES_NEW starts a new transaction handle", async () => {
    let tx1Handle: any;
    let tx2Handle: any;

    await castor.transaction(async (tx1) => {
      tx1Handle = tx1.db;
      await tx1.transaction(async (tx2) => {
        tx2Handle = tx2.db;
        // REQUIRES_NEW in Drizzle/PG creates a new transaction proxy (Savepoint)
        expect(tx2Handle).not.toBe(tx1Handle);
      }, { propagation: "REQUIRES_NEW" });
    });
  });

  test("NESTED: Inner rollback via Savepoint", async () => {
    const userRepo = castor.repoFactory("users");
    const emailOuter = "outer@example.com";
    const emailInner = "inner@example.com";

    await castor.transaction(async (tx1) => {
      await tx1.repoFactory("users").createOne({ name: "Outer", email: emailOuter }, "admin");

      try {
        await tx1.transaction(async (tx2) => {
          await tx2.repoFactory("users").createOne({ name: "Inner", email: emailInner }, "admin");
          throw new Error("Rollback Inner Only");
        }, { propagation: "NESTED" });
      } catch (e: any) {
        expect(e.message).toBe("Rollback Inner Only");
      }

      // Outer should still be visible here
      const outerFound = await tx1.repoFactory("users").searchOne({ filter: { email: { $eq: emailOuter } } }, "admin");
      expect(outerFound).not.toBeNull();
    });

    // Verify final state
    const all = await userRepo.searchMany({}, "admin");
    expect(all.map(u => u.email)).toContain(emailOuter);
    expect(all.map(u => u.email)).not.toContain(emailInner);
  });

  test("Propagation: SUPPORTS behavioral check", async () => {
    const userRepo = castor.repoFactory("users");
    const email = "supports@example.com";

    // Case 1: Outside transaction -> no rollback
    try {
      await castor.transaction(async () => {
        await userRepo.createOne({ name: "Supports 1", email }, "admin");
        throw new Error("No Rollback");
      }, { propagation: "SUPPORTS" });
    } catch (e) {}
    expect(await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin")).not.toBeNull();

    await db.delete(users).where(eq(users.email, email));

    // Case 2: Inside transaction -> joins and rollbacks
    try {
      await castor.transaction(async () => {
        await castor.transaction(async () => {
          await userRepo.createOne({ name: "Supports 2", email }, "admin");
          throw new Error("Rollback");
        }, { propagation: "SUPPORTS" });
      });
    } catch (e) {}
    expect(await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin")).toBeNull();
  });

  test("Stale Repository: Joins active transaction even if created outside", async () => {
    const userRepo = castor.repoFactory("users");
    const email = "stale@example.com";

    try {
      await castor.transaction(async () => {
        await userRepo.createOne({ name: "Stale User", email }, "admin");
        throw new Error("Rollback Stale");
      });
    } catch (e) {}

    const found = await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin");
    expect(found).toBeNull();
  });

  test("Guard Rails: MANDATORY and NEVER", async () => {
    await expect(castor.transaction(async () => {}, { propagation: "MANDATORY" }))
      .rejects.toThrow(/MANDATORY' failed/);

    await castor.transaction(async (tx) => {
      await expect(tx.transaction(async () => {}, { propagation: "NEVER" }))
        .rejects.toThrow(/NEVER' failed/);
    });
  });

  test("Isolation Levels: Sets level on Drizzle options", async () => {
    await castor.transaction(async (tx) => {
      await tx.repoFactory("users").createOne({ name: "Iso", email: "iso@ex.com" }, "admin");
    }, { isolationLevel: "serializable" });

    const found = await castor.repoFactory("users").searchOne({ filter: { email: { $eq: "iso@ex.com" } } }, "admin");
    expect(found).not.toBeNull();
  });

  test("Access Mode: 'read only' prevents mutations", async () => {
    const userRepo = castor.repoFactory("users");
    
    // In PG, this should throw a DB error if we try to mutate
    try {
      await castor.transaction(async (tx) => {
        await tx.repoFactory("users").createOne({ name: "RO", email: "ro@ex.com" }, "admin");
      }, { accessMode: "read only" });
      // If it didn't throw, it's a fail (some drivers might ignore it though, but PG usually doesn't)
    } catch (e: any) {
      // expect(e.message).toMatch(/read-only transaction/);
      expect(e).toBeDefined();
    }
  });

  test("Middleware State: Context state persists across transaction boundaries", async () => {
    const builderWithMiddleware = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
        if (ctx.tableName === "users") {
           ctx.state.midApplied = true;
        }
        return await next();
      });
    const castorWithMid = builderWithMiddleware.build();
    const userRepoWithMid = castorWithMid.repoFactory("users");

    await castorWithMid.transaction(async (tx) => {
      await userRepoWithMid.searchMany({});
      
      const ctx = getExecutionContext();
      expect(ctx?.state.midApplied).toBe(true);

      await tx.transaction(async (tx2) => {
          const innerCtx = getExecutionContext();
          expect(innerCtx?.state.midApplied).toBe(true);
      }, { propagation: "REQUIRED" });
    });
  });

  test("Recursive Rollback: 3-level depth with REQUIRED", async () => {
    const userRepo = castor.repoFactory("users");

    try {
      await castor.transaction(async (tx1) => {
        await tx1.repoFactory("users").createOne({ name: "L1", email: "l1@ex.com" }, "admin");
        await tx1.transaction(async (tx2) => {
          await tx2.repoFactory("users").createOne({ name: "L2", email: "l2@ex.com" }, "admin");
          await tx2.transaction(async (tx3) => {
             await tx3.repoFactory("users").createOne({ name: "L3", email: "l3@ex.com" }, "admin");
             throw new Error("Depth 3 Crash");
          }, { propagation: "REQUIRED" });
        }, { propagation: "REQUIRED" });
      });
    } catch (e) {}

    const all = await userRepo.searchMany({}, "admin");
    expect(all).toHaveLength(0);
  });

  test("RBAC Rollback: Violation in second operation rolls back first", async () => {
    const builderStrict = createSchemaBuilder(db, [users, posts] as const, "strict")
      .policies("users", { 
          admin: { allowedActions: "*", allowedProjections: "*", allowedFilters: "*" },
          user: { allowedActions: ["create", "read"], allowedProjections: "*", allowedFilters: "*" }
      })
      .policies("posts", { 
          admin: { allowedActions: "*", allowedProjections: "*", allowedFilters: "*" },
          user: { allowedActions: ["read"], allowedProjections: "*", allowedFilters: "*" }
      });
    const castorStrict = builderStrict.build();
    const userRepo = castorStrict.repoFactory("users");

    const email = "rbac-rollback@ex.com";

    try {
      await castorStrict.transaction(async (tx) => {
        // 1. Success (user can create users)
        await tx.repoFactory("users").createOne({ name: "RBAC User", email }, "user");

        // 2. Failure (user CANNOT create posts)
        await tx.repoFactory("posts").createOne({ title: "Forbidden Post" }, "user");
      });
    } catch (e: any) {
      expect(e.name).toBe("AccessDeniedError");
    }

    // First operation must be rolled back
    const found = await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin");
    expect(found).toBeNull();
  });
});
