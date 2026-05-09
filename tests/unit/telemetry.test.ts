import { expect, test, describe, mock } from "bun:test";
import { createSchemaBuilder } from "../../src";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

describe("Telemetry & Logging System", () => {
  const mockTable = sqliteTable("test_table", { id: text("id") });
  
  const createMockDb = () => {
    const db: any = {
      where: () => db,
      groupBy: () => db,
      orderBy: () => db,
      limit: () => db,
      offset: () => db,
      innerJoin: () => db,
      as: () => db,
      select: () => db,
      from: () => db,
      with: () => db,
      $with: () => ({ as: () => db }),
      transaction: async (cb: any) => cb(db),
      delete: () => db,
      then: (resolve: any) => resolve([]),
      catch: () => db,
    };
    return db;
  };

  const db = createMockDb();

  test("Emits 'execution' event on successful action", async () => {
    const builder = createSchemaBuilder(db, [mockTable] as const);
    const handler = mock(() => {});
    builder.on("execution", handler);

    const metadata = builder.build();
    const repo = metadata.repoFactory("test_table");
    
    await repo.searchOne({});

    // Give microtask queue time to process
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalled();
    const payload = handler.mock.calls[0][0];
    expect(payload.tableName).toBe("test_table");
    expect(payload.action).toBe("read");
    expect(payload.status).toBe("success");
    expect(payload.duration).toBeGreaterThanOrEqual(0);
  });

  test("Emits 'security' event on field trimming", async () => {
    const builder = createSchemaBuilder(db, [mockTable] as const);
    const handler = mock(() => {});
    builder.on("security", handler);

    builder.policies("test_table", {
      default: { 
        allowedActions: ["read"],
        allowedProjections: ["id"] // 'name' is not allowed
      }
    });

    const metadata = builder.build();
    const repo = metadata.repoFactory("test_table");
    
    await repo.searchOne({ projection: ["id", "name"] as any });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalled();
    const payload = handler.mock.calls[0][0];
    expect(payload.type).toBe("field_trim");
    expect(payload.fields).toContain("name");
  });

  test("Emits 'error' event on failure", async () => {
    const errorDb = createMockDb();
    // Force an error during query building
    errorDb.select = () => { throw new Error("DB Crash"); };

    const builder = createSchemaBuilder(errorDb, [mockTable] as const);
    const handler = mock(() => {});
    builder.on("error", handler);

    const metadata = builder.build();
    const repo = metadata.repoFactory("test_table");
    
    try {
      await repo.searchOne({});
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].error.message).toBe("DB Crash");
  });
});