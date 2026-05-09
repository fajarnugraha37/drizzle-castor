import { expect, test, describe } from "bun:test";
import { createSchemaBuilder } from "../../../src/schema-metadata-builder";
import { getContext, getSchemaConfig } from "../../../src/helper/context-helper";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

describe("ExecutionContext Integration", () => {
  const users = sqliteTable("users", {
    id: integer("id").primaryKey(),
    name: text("name"),
  });

  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  
  // Setup table
  sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

  const fullAccess = {
    allowedProjections: ["*"],
    allowedFilters: ["*"],
    allowedSets: ["*"],
    allowedSorts: ["*"],
  };

  const allActions = ["create", "read", "update", "softDelete", "restore", "hardDelete"];

  test("Repository methods are wrapped in ExecutionContext automatically", async () => {
    let capturedContext: any;

    const schemaWithMiddleware = createSchemaBuilder(db as any, [users])
      .use(async (ctx, next) => {
        capturedContext = getContext();
        return next();
      })
      .table("users", {
        profiles: { admin: allActions }
      })
      .build();

    const repo = schemaWithMiddleware.repoFactory("users", { admin: fullAccess });
    await repo.searchOne({ filter: { id: 1 } }, "admin");

    expect(capturedContext).toBeDefined();
    expect(capturedContext.action).toBe("read");
    expect(capturedContext.tableName).toBe("users");
    expect(capturedContext.traceId).toBeDefined();
    expect(capturedContext.profile).toBe("admin");
  });

  test("getSchemaConfig retrieves correct table config from context", async () => {
    const userConfig = { 
      profiles: { admin: allActions },
      customInfo: "user-table" 
    };
    
    const schemaWithConfig = createSchemaBuilder(db as any, [users])
      .use(async (ctx, next) => {
        const config = getSchemaConfig<any>();
        expect(config.customInfo).toBe("user-table");
        return next();
      })
      .table("users", userConfig as any)
      .build();

    const repo = schemaWithConfig.repoFactory("users", { admin: fullAccess });
    await repo.searchOne({}, "admin");
  });

  test("Nested repository calls share traceId but track span hierarchy via parentId", async () => {
    let traceIds: string[] = [];
    let spanIds: string[] = [];
    let parentIds: (string|undefined)[] = [];

    const recorderMiddleware = async (ctx: any, next: any) => {
      const c = getContext();
      traceIds.push(c.traceId);
      spanIds.push(c.spanId);
      parentIds.push(c.parentId);
      return next();
    };

    const schemaBase = createSchemaBuilder(db as any, [users])
      .use(recorderMiddleware)
      .table("users", {
        profiles: { admin: allActions }
      })
      .build();

    const repoBase = schemaBase.repoFactory("users", { admin: fullAccess });

    // Simulate A calls B
    const schemaWithCall = createSchemaBuilder(db as any, [users])
      .use(recorderMiddleware)
      .use(async (ctx, next) => {
        if (ctx.state.alreadyCalled) {
            return next();
        }
        ctx.state.alreadyCalled = true;
        await repoBase.searchMany({}, "admin");
        return next();
      })
      .table("users", {
        profiles: { admin: allActions }
      })
      .build();

    const repoTarget = schemaWithCall.repoFactory("users", { admin: fullAccess });
    await repoTarget.searchOne({}, "admin");

    // repoTarget.searchOne (Parent) -> index 0
    // repoBase.searchMany (Child) -> index 1
    
    expect(traceIds.length).toBeGreaterThanOrEqual(2);
    expect(traceIds[1]).toBe(traceIds[0]); // Shared traceId
    expect(parentIds[1]).toBe(spanIds[0]); // Child's parentId is Parent's spanId
    expect(spanIds[1]).not.toBe(spanIds[0]); // Distinct spanIds
  });
});
