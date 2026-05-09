import { expect, test, describe, mock, beforeEach } from "bun:test";
import { createHooksMiddleware } from "../../../src/middleware/hooks";
import type { MiddlewareContext } from "../../../src/middleware/index";
import { pgTable, serial } from "drizzle-orm/pg-core";
import { runInContext } from "../../../src/context/manager";

describe("Hooks Middleware", () => {
  // Use real Drizzle table for reliable mock context
  const mockTable = pgTable("users", {
    id: serial("id").primaryKey(),
  });

  const createMockContext = (action: any, params: any, hooks?: any): ExecutionContext<any, any> => ({
    action,
    tableName: "users",
    profile: "default",
    params,
    translatorContext: {
      db: {} as any,
      tables: [mockTable],
      metadata: {
        users: { hooks }
      },
      baseTableName: "users"
    },
    state: {}
  });

  const runWithContext = async (action: any, params: any, hooks: any, fn: (ctx: ExecutionContext<any, any>) => Promise<any>) => {
    const ctx = createMockContext(action, params, hooks);
    return runInContext({
        action,
        tableName: "users",
        profile: "default",
        params,
        metadata: {},
        db: {} as any,
        schemaMetadata: { users: { hooks } },
        translatorContext: ctx.translatorContext
    }, async (executionCtx) => fn(executionCtx));
  };

  const middleware = createHooksMiddleware();

  describe("Bypasses if no hooks are defined", () => {
    test("Bypasses if no hooks are defined", async () => {
      const ctx = createMockContext("read", {});
      const next = mock(() => Promise.resolve(true));
      
      await runWithContext("read", {}, {}, async (c) => middleware(c, next));
      expect(next).toHaveBeenCalled();
    });
  });

  describe("Create Operations", () => {
    test("Single creation triggers beforeCreate and afterCreate", async () => {
      const hooks = {
        beforeCreate: mock(async () => {}),
        afterCreate: mock(async () => {}),
      };
      const data = { name: "test" };
      const next = mock(() => Promise.resolve({ id: 1, ...data }));

      const result = await runWithContext("create", { data }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeCreate).toHaveBeenCalled();
      expect(hooks.afterCreate).toHaveBeenCalled();
      // Verify context was passed as second arg
      expect(hooks.beforeCreate.mock.calls[0][1].traceId).toBeDefined();
    });

    test("Batch creation triggers beforeCreate and afterCreate with arrays", async () => {
      const hooks = {
        beforeCreate: mock(async () => {}),
        afterCreate: mock(async () => {}),
      };
      const data = [{ name: "t1" }, { name: "t2" }];
      const next = mock(() => Promise.resolve([{ id: 1, ...data[0] }, { id: 2, ...data[1] }]));

      const result = await runWithContext("create", { data }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeCreate).toHaveBeenCalledWith(data, expect.anything());
      expect(hooks.afterCreate).toHaveBeenCalledWith(result, expect.anything());
    });
  });

  describe("Read Operations", () => {
    test("SearchOne triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(async () => {}),
        afterSearch: mock(async () => {}),
      };
      const query = { filter: { id: 1 } };
      const next = mock(() => Promise.resolve({ id: 1 }));

      const result = await runWithContext("read", { query }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeSearch).toHaveBeenCalled();
      expect(hooks.afterSearch).toHaveBeenCalled();
    });

    test("SearchMany triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(async () => {}),
        afterSearch: mock(async () => {}),
      };
      const query = { filter: { id: { $gt: 0 } } };
      const next = mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]));

      const result = await runWithContext("read", { query }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeSearch).toHaveBeenCalled();
      expect(hooks.afterSearch).toHaveBeenCalled();
    });

    test("SearchPage extracts data array from paginated response for afterSearch hook", async () => {
      const hooks = {
        afterSearch: mock(async () => {}),
      };
      const query = { page: 1, pageSize: 10 };
      const paginatedResult = { data: [{ id: 1 }], meta: {} };
      const next = mock(() => Promise.resolve(paginatedResult));

      await runWithContext("read", { query }, hooks, (c) => middleware(c, next));

      expect(hooks.afterSearch).toHaveBeenCalled();
    });
  });

  describe("Update Operations", () => {
    test("UpdateOne triggers beforeUpdate with ID filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(async () => {}),
        afterUpdate: mock(async () => {}),
      };
      const next = mock(() => Promise.resolve({ id: 1, name: "new" }));

      const result = await runWithContext("update", { id: 1, set: { name: "new" } }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeUpdate).toHaveBeenCalled();
      expect(hooks.afterUpdate).toHaveBeenCalled();
    });

    test("UpdateMany triggers beforeUpdate with custom filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(async () => {}),
        afterUpdate: mock(async () => {}),
      };
      const filter = { status: "active" };
      const next = mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]));

      const result = await runWithContext("update", { filter, set: { status: "inactive" } }, hooks, (c) => middleware(c, next));

      expect(hooks.beforeUpdate).toHaveBeenCalled();
      expect(hooks.afterUpdate).toHaveBeenCalled();
    });
  });

  describe("Deletion & Restore Operations", () => {
    test("SoftDelete triggers beforeSoftDelete and afterSoftDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeSoftDelete: mock(async () => {}),
        afterSoftDelete: mock(async () => {}),
      };
      const next = mock(() => Promise.resolve(true));

      await runWithContext("softDelete", { id: 99 }, hooks, async (ctx) => {
        ctx.state.affectedRecords = [{ id: 99 }];
        return middleware(ctx, next);
      });

      expect(hooks.beforeSoftDelete).toHaveBeenCalled();
      expect(hooks.afterSoftDelete).toHaveBeenCalled();
    });

    test("Restore triggers beforeRestore and afterRestore using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeRestore: mock(async () => {}),
        afterRestore: mock(async () => {}),
      };
      const next = mock(() => Promise.resolve(true));

      await runWithContext("restore", { id: 99 }, hooks, async (ctx) => {
        ctx.state.affectedRecords = [{ id: 99 }];
        return middleware(ctx, next);
      });

      expect(hooks.beforeRestore).toHaveBeenCalled();
      expect(hooks.afterRestore).toHaveBeenCalled();
    });

    test("HardDelete triggers beforeHardDelete and afterHardDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeHardDelete: mock(async () => {}),
        afterHardDelete: mock(async () => {}),
      };
      const next = mock(() => Promise.resolve(true));

      await runWithContext("hardDelete", { id: 99 }, hooks, async (ctx) => {
        ctx.state.affectedRecords = [{ id: 99 }];
        return middleware(ctx, next);
      });

      expect(hooks.beforeHardDelete).toHaveBeenCalled();
      expect(hooks.afterHardDelete).toHaveBeenCalled();
    });

    test("Delete/Restore skips AFTER hook if ctx.state.affectedRecords is missing", async () => {
      const hooks = {
        afterHardDelete: mock(async () => {}),
      };
      const next = mock(() => Promise.resolve(true));

      await runWithContext("hardDelete", { id: 99 }, hooks, (c) => middleware(c, next));
      
      expect(hooks.afterHardDelete).not.toHaveBeenCalled();
    });
  });
});
