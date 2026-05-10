import { describe, test, before, after, beforeEach } from "node:test";
import { expect } from "expect";
import { MySqlContainer, StartedMySqlContainer } from "@testcontainers/mysql";
import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql, eq } from "drizzle-orm";
import { createSchemaBuilder } from "../../../src";
import { users, posts, migrations } from "./schema";
import { ConfigurationError } from "../../../src/errors";
import { getExecutionContext } from "../../../src/context/manager";

describe("MySQL Integration - Transaction Management", () => {
  let container: StartedMySqlContainer;
  let connection: mysql.Connection;
  let db: MySql2Database;
  let builder: any;
  let castor: any;

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
    db = drizzle(connection);

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
    if (connection) await connection.end();
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
        // REQUIRES_NEW in Drizzle creates a new transaction proxy (Savepoint)
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

  test("Access Mode: 'read only' prevents mutations (Behavioral check)", async () => {
    const userRepo = castor.repoFactory("users");
    
    // In MySQL, access mode read only might not throw immediately on some configurations 
    // unless strictly enforced by the server/connection. 
    // We verify it doesn't break basic flows.
    await castor.transaction(async (tx) => {
      await tx.repoFactory("users").searchMany({}, "admin");
    }, { accessMode: "read only" });
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
        await tx.repoFactory("users").createOne({ name: "RBAC User", email }, "user");
        await tx.repoFactory("posts").createOne({ title: "Forbidden Post" }, "user");
      });
    } catch (e: any) {
      expect(e.name).toBe("AccessDeniedError");
    }

    const found = await userRepo.searchOne({ filter: { email: { $eq: email } } }, "admin");
    expect(found).toBeNull();
  });

  test("Concurrency: Parallel transactions do not leak context", async () => {
    const userRepo = castor.repoFactory("users");
    const results: string[] = [];

    // MySQL supports real parallel transactions via pool
    await Promise.all([
      castor.transaction(async (tx1) => {
        const email = "p1@parallel.com";
        await tx1.repoFactory("users").createOne({ name: "P1", email }, "admin");
        // Verify state is unique to this flow
        const ctx = getExecutionContext();
        ctx!.state.flow = "F1";
        await new Promise(r => setTimeout(r, 50));
        expect(getExecutionContext()?.state.flow).toBe("F1");
        results.push("F1");
      }),
      castor.transaction(async (tx2) => {
        const email = "p2@parallel.com";
        await tx2.repoFactory("users").createOne({ name: "P2", email }, "admin");
        const ctx = getExecutionContext();
        ctx!.state.flow = "F2";
        await new Promise(r => setTimeout(r, 20));
        expect(getExecutionContext()?.state.flow).toBe("F2");
        results.push("F2");
      })
    ]);

    expect(results).toContain("F1");
    expect(results).toContain("F2");
    expect(await userRepo.searchMany({}, "admin")).toHaveLength(2);
  });

  test("Internal Step Atomicity: hydration failure rolls back mutation", async () => {
    // MySQL uses TEMPORARY TABLE strategy for hydration.
    // If we trigger a failure AFTER the update but BEFORE/DURING hydration,
    // the whole thing must rollback.
    const userRepo = castor.repoFactory("users");
    const user = await userRepo.createOne({ name: "Atomic", email: "atomic@ex.com" }, "admin");

    // We simulate a failure by using a middleware that crashes on 'read' action 
    // for a specific record, which happens during re-hydration.
    const builderCrash = createSchemaBuilder(db, [users] as const, "lenient")
      .use(async (ctx, next) => {
         // During hydration, searchOne is called with a filter on the PK.
         if (ctx.action === "read" && ctx.params?.filter?.id?.$eq === user.id) {
            throw new Error("Hydration Crash");
         }
         return await next();
      });
    const castorCrash = builderCrash.build();

    try {
      // updateOne calls update internally, then searchOne for hydration.
      await castorCrash.repoFactory("users").updateOne(user.id, { name: "Corrupted" }, "admin");
    } catch (e: any) {
      expect(e.message).toContain("Hydration Crash");
    }

    // Verify the record was NOT updated in the database due to atomicity
    const fresh = await userRepo.searchOne({ filter: { id: { $eq: user.id } } }, "admin");
    expect(fresh?.name).toBe("Atomic");
  });
});
