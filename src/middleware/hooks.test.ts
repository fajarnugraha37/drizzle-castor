import { expect, test, describe, mock } from "bun:test";
import { createHooksMiddleware } from "./hooks";
import type { MiddlewareContext } from "./index";

describe("Hooks Middleware", () => {
  const middleware = createHooksMiddleware();

  const createMockContext = (
    action: any,
    params: any,
    hooks: any,
    state: any = {}
  ): MiddlewareContext => ({
    action,
    tableName: "users",
    profile: "default",
    params,
    state,
    translatorContext: {
      metadata: {
        users: { hooks }
      }
    } as any
  });

  test("Bypasses if no hooks are defined", async () => {
    const next = mock(() => Promise.resolve("result"));
    const ctx = createMockContext("read", {}, undefined);
    
    const result = await middleware(ctx, next);
    expect(result).toBe("result");
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe("Create Operations", () => {
    test("Single creation triggers beforeCreate and afterCreate", async () => {
      const hooks = {
        beforeCreate: mock(() => Promise.resolve()),
        afterCreate: mock(() => Promise.resolve())
      };
      const ctx = createMockContext("create", { data: { name: "John" } }, hooks);
      const next = mock(() => Promise.resolve({ id: 1, name: "John" }));

      const result = await middleware(ctx, next);
      
      expect(result).toEqual({ id: 1, name: "John" });
      expect(hooks.beforeCreate).toHaveBeenCalledWith({ name: "John" });
      expect(hooks.afterCreate).toHaveBeenCalledWith({ id: 1, name: "John" });
    });

    test("Batch creation triggers beforeCreateMany and afterCreateMany if defined", async () => {
      const hooks = {
        beforeCreateMany: mock(() => Promise.resolve()),
        afterCreateMany: mock(() => Promise.resolve())
      };
      const inputData = [{ name: "A" }, { name: "B" }];
      const outputData = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
      
      const ctx = createMockContext("create", { data: inputData }, hooks);
      const next = mock(() => Promise.resolve(outputData));

      await middleware(ctx, next);
      
      expect(hooks.beforeCreateMany).toHaveBeenCalledWith(inputData);
      expect(hooks.afterCreateMany).toHaveBeenCalledWith(outputData);
    });

    test("Batch creation falls back to iterating single hooks if Many hooks are not defined", async () => {
      const hooks = {
        beforeCreate: mock(() => Promise.resolve()),
        afterCreate: mock(() => Promise.resolve())
      };
      const inputData = [{ name: "A" }, { name: "B" }];
      const outputData = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
      
      const ctx = createMockContext("create", { data: inputData }, hooks);
      const next = mock(() => Promise.resolve(outputData));

      await middleware(ctx, next);
      
      expect(hooks.beforeCreate).toHaveBeenCalledTimes(2);
      expect(hooks.beforeCreate).toHaveBeenNthCalledWith(1, { name: "A" });
      expect(hooks.beforeCreate).toHaveBeenNthCalledWith(2, { name: "B" });
      
      expect(hooks.afterCreate).toHaveBeenCalledTimes(2);
      expect(hooks.afterCreate).toHaveBeenNthCalledWith(1, { id: 1, name: "A" });
      expect(hooks.afterCreate).toHaveBeenNthCalledWith(2, { id: 2, name: "B" });
    });
  });

  describe("Read Operations", () => {
    test("SearchOne triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(() => Promise.resolve()),
        afterSearch: mock(() => Promise.resolve())
      };
      const query = { filter: { name: { $eq: "John" } } };
      const ctx = createMockContext("read", { query }, hooks);
      const next = mock(() => Promise.resolve({ id: 1, name: "John" })); // single object result

      await middleware(ctx, next);
      
      expect(hooks.beforeSearch).toHaveBeenCalledWith(query);
      expect(hooks.afterSearch).toHaveBeenCalledWith(query, [{ id: 1, name: "John" }]); // wrapped in array
    });

    test("SearchMany triggers beforeSearch and afterSearch with array result", async () => {
      const hooks = {
        beforeSearch: mock(() => Promise.resolve()),
        afterSearch: mock(() => Promise.resolve())
      };
      const query = { filter: {} };
      const ctx = createMockContext("read", { query }, hooks);
      const outputData = [{ id: 1 }, { id: 2 }];
      const next = mock(() => Promise.resolve(outputData));

      await middleware(ctx, next);
      
      expect(hooks.beforeSearch).toHaveBeenCalledWith(query);
      expect(hooks.afterSearch).toHaveBeenCalledWith(query, outputData);
    });

    test("SearchPage extracts data array from paginated response for afterSearch hook", async () => {
      const hooks = {
        afterSearch: mock(() => Promise.resolve())
      };
      const query = { page: 1, pageSize: 10 };
      const ctx = createMockContext("read", { query }, hooks);
      
      const pageResult = { data: [{ id: 1 }], meta: { totalItems: 1 } };
      const next = mock(() => Promise.resolve(pageResult as any));

      await middleware(ctx, next);
      
      expect(hooks.afterSearch).toHaveBeenCalledWith(query, [{ id: 1 }]);
    });
  });

  describe("Update Operations", () => {
    test("UpdateOne triggers beforeUpdate with ID filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(() => Promise.resolve()),
        afterUpdate: mock(() => Promise.resolve())
      };
      const setParams = { name: "Jane" };
      const ctx = createMockContext("update", { id: 5, set: setParams }, hooks);
      const next = mock(() => Promise.resolve({ id: 5, name: "Jane" }));

      await middleware(ctx, next);
      
      expect(hooks.beforeUpdate).toHaveBeenCalledWith(setParams, { id: { $eq: 5 } });
      expect(hooks.afterUpdate).toHaveBeenCalledWith(setParams, [{ id: 5, name: "Jane" }]);
    });

    test("UpdateMany triggers beforeUpdate with custom filter and afterUpdate", async () => {
      const hooks = {
        beforeUpdate: mock(() => Promise.resolve()),
        afterUpdate: mock(() => Promise.resolve())
      };
      const setParams = { is_active: true };
      const filter = { age: { $gt: 20 } };
      const ctx = createMockContext("update", { filter, set: setParams }, hooks);
      const outputData = [{ id: 1 }, { id: 2 }];
      const next = mock(() => Promise.resolve(outputData));

      await middleware(ctx, next);
      
      expect(hooks.beforeUpdate).toHaveBeenCalledWith(setParams, filter);
      expect(hooks.afterUpdate).toHaveBeenCalledWith(setParams, outputData);
    });
  });

  describe("Deletion & Restore Operations", () => {
    test("SoftDelete triggers beforeSoftDelete and afterSoftDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeSoftDelete: mock(() => Promise.resolve()),
        afterSoftDelete: mock(() => Promise.resolve())
      };
      
      const affectedRecords = [{ id: 10, name: "Deleted User" }];
      const ctx = createMockContext("softDelete", { id: 10 }, hooks, { affectedRecords });
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);
      
      expect(hooks.beforeSoftDelete).toHaveBeenCalledWith({ id: { $eq: 10 } });
      expect(hooks.afterSoftDelete).toHaveBeenCalledWith(affectedRecords);
    });

    test("Restore triggers beforeRestore and afterRestore using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeRestore: mock(() => Promise.resolve()),
        afterRestore: mock(() => Promise.resolve())
      };
      
      const affectedRecords = [{ id: 20 }];
      const filter = { is_active: { $eq: false } };
      const ctx = createMockContext("restore", { filter }, hooks, { affectedRecords });
      const next = mock(() => Promise.resolve(1));

      await middleware(ctx, next);
      
      expect(hooks.beforeRestore).toHaveBeenCalledWith(filter);
      expect(hooks.afterRestore).toHaveBeenCalledWith(affectedRecords);
    });

    test("HardDelete triggers beforeHardDelete and afterHardDelete using ctx.state.affectedRecords", async () => {
      const hooks = {
        beforeHardDelete: mock(() => Promise.resolve()),
        afterHardDelete: mock(() => Promise.resolve())
      };
      
      const affectedRecords = [{ id: 99 }];
      const ctx = createMockContext("hardDelete", { id: 99 }, hooks, { affectedRecords });
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);
      
      expect(hooks.beforeHardDelete).toHaveBeenCalledWith({ id: { $eq: 99 } });
      expect(hooks.afterHardDelete).toHaveBeenCalledWith(affectedRecords);
    });
    
    test("Delete/Restore skips AFTER hook if ctx.state.affectedRecords is missing", async () => {
      const hooks = {
        afterHardDelete: mock(() => Promise.resolve())
      };
      
      // Missing affectedRecords in state
      const ctx = createMockContext("hardDelete", { id: 99 }, hooks);
      const next = mock(() => Promise.resolve(true));

      await middleware(ctx, next);
      
      expect(hooks.afterHardDelete).not.toHaveBeenCalled();
    });
  });
});