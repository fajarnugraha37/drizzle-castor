import { expect, test, describe, mock, beforeEach } from "bun:test";
import { createHooksMiddleware } from "../../../src/middleware/hooks";
import type { MiddlewareContext } from "../../../src/middleware/index";
import { pgTable, serial } from "drizzle-orm/pg-core";

describe("Hooks Middleware", () => {
  // Use real Drizzle table for reliable mock context
  const mockTable = pgTable("users", {
    id: serial("id").primaryKey(),
  });

  const createMockContext = (action: any, params: any, hooks?: any): MiddlewareContext => ({
    action,
    tableName: "users",
    profile: "default",
    params,
    translatorContext: {
      db: {} as any,
      tables: [mockTable], // Required by new hooks hardening
      metadata: {
        users: { hooks }
      },
      baseTableName: "users" // Required by new hooks hardening
    },
    state: {}
  });

  const middleware = createHooksMiddleware();

  describe("Bypasses if no hooks are defined", () => {
    test("Bypasses if no hooks are defined", async () => {
      const ctx = createMockContext("read", {});
      const next = mock(() => Promise.resolve(true));
      
      await middleware(ctx, next);
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
      const ctx = createMockContext("create", { data }, hooks);
      const next = mock(() => Promise.resolve({ id: 1, ...data }));

      const result = await middleware(ctx, next);

      expect(hooks.beforeCreate).toHaveBeenCalledWith(data);
      expect(hooks.afterCreate).toHaveBeenCalledWith(result);
    });

    test("Batch creation triggers beforeCreateMany and afterCreateMany if defined", async () => {
      const hooks = {
        beforeCreateMany: mock(async () => {}),
        afterCreateMany: mock(async () => {}),
      };
      const data = [{ name: "t1" }, { name: "t2" }];
      const ctx = createMockContext("create", { data }, hooks);
      const next = mock(() => Promise.resolve([{ id: 1, ...data[0] }, { id: 2, ...data[1] }]));

      const result = await middleware(ctx, next);

      expect(hooks.beforeCreateMany).toHaveBeenCalledWith(data);
      expect(hooks.afterCreateMany).toHaveBeenCalledWith(result);
    });

    test("Batch creation falls back to iterating single hooks if Many hooks are not defined", async () => {
      const hooks = {
        beforeCreate: mock(async () => {}),
        afterCreate: mock(async () => {}),
      };
      const data = [{ name: "t1" }, { name: "t2" }];
      const ctx = createMockContext("create", { data }, hooks);
      const next = mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]));

      await middleware(ctx, next);

      expect(hooks.beforeCreate).toHaveBeenCalledTimes(2);
      expect(hooks.afterCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("Read Operations", () => {
    test("SearchOne triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(async () => {}),
        afterSearch: mock(async () => {}),
      };
      const query = { filter: { id: 1 } };
      const ctx = createMockContext("read", { query }, hooks);
      const next = mock(() => Promise.resolve({ id: 1 }));

      const result = await middleware(ctx, next);

      expect(hooks.beforeSearch).toHaveBeenCalledWith(query);
      expect(hooks.afterSearch).toHaveBeenCalledWith(query, [result]);
    });

    test("SearchMany triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(async () => {}),
        afterSearch: mock(async () => {}),
      };
      const query = { filter: { id: { $gt: 0 } } };
      const ctx = createMockContext("read", { query }, hooks);
      const next = mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]));

      const result = await middleware(ctx, next);

      expect(hooks.beforeSearch).toHaveBeenCalledWith(query);
      expect(hooks.afterSearch).toHaveBeenCalledWith(query, result);
    });

    test("SearchPage extracts data array from paginated response for afterSearch hook", async () => {
      const hooks = {
        afterSearch: mock(async () => {}),
      };
      const query = { page: 1, pageSize: 10 };
      const ctx = createMockContext("read", { query }, hooks);
      const paginatedResult = { data: [{ id: 1 }], meta: {} };
      const next = mock(() => Promise.resolve(paginatedResult));

      await middleware(ctx, next);

      expect(hooks.afterSearch).toHaveBeenCalledWith(query, paginatedResult.data);
    });
  });

  describe("Update Operations", () => {
    test("UpdateOne triggers beforeUpdate with ID filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(async () => {}),
        afterUpdate: mock(async () => {}),
      };
      const ctx = createMockContext("update", { id: 1, set: { name: "new" } }, hooks);
      const next = mock(() => Promise.resolve({ id: 1, name: "new" }));

      const result = await middleware(ctx, next);

      expect(hooks.beforeUpdate).toHaveBeenCalledWith({ name: "new" }, { id: { $eq: 1 } });
      expect(hooks.afterUpdate).toHaveBeenCalledWith({ name: "new" }, [result]);
    });

    test("UpdateMany triggers beforeUpdate with custom filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(async () => {}),
        afterUpdate: mock(async () => {}),
      };
      const filter = { status: "active" };
      const ctx = createMockContext("update", { filter, set: { status: "inactive" } }, hooks);
      const next = mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]));

      const result = await middleware(ctx, next);

      expect(hooks.beforeUpdate).toHaveBeenCalledWith({ status: "inactive" }, filter);
      expect(hooks.afterUpdate).toHaveBeenCalledWith({ status: "inactive" }, result);
    });
  });

  describe("Deletion & Restore Operations", () => {
    test("SoftDelete triggers beforeSoftDelete and afterSoftDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeSoftDelete: mock(async () => {}),
        afterSoftDelete: mock(async () => {}),
      };
      const ctx = createMockContext("softDelete", { id: 99 }, hooks);
      ctx.state.affectedRecords = [{ id: 99 }];
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);

      expect(hooks.beforeSoftDelete).toHaveBeenCalledWith({ id: { $eq: 99 } });
      expect(hooks.afterSoftDelete).toHaveBeenCalledWith(ctx.state.affectedRecords);
    });

    test("Restore triggers beforeRestore and afterRestore using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeRestore: mock(async () => {}),
        afterRestore: mock(async () => {}),
      };
      const ctx = createMockContext("restore", { id: 99 }, hooks);
      ctx.state.affectedRecords = [{ id: 99 }];
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);

      expect(hooks.beforeRestore).toHaveBeenCalledWith({ id: { $eq: 99 } });
      expect(hooks.afterRestore).toHaveBeenCalledWith(ctx.state.affectedRecords);
    });

    test("HardDelete triggers beforeHardDelete and afterHardDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeHardDelete: mock(async () => {}),
        afterHardDelete: mock(async () => {}),
      };
      const ctx = createMockContext("hardDelete", { id: 99 }, hooks);
      ctx.state.affectedRecords = [{ id: 99 }];
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);

      expect(hooks.beforeHardDelete).toHaveBeenCalledWith({ id: { $eq: 99 } });
      expect(hooks.afterHardDelete).toHaveBeenCalledWith(ctx.state.affectedRecords);
    });

    test("Delete/Restore skips AFTER hook if ctx.state.affectedRecords is missing", async () => {
      const hooks = {
        afterHardDelete: mock(async () => {}),
      };
      const ctx = createMockContext("hardDelete", { id: 99 }, hooks);
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);
      
      expect(hooks.afterHardDelete).not.toHaveBeenCalled();
    });
  });
});
