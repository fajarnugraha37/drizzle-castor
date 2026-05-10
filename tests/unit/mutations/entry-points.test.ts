import { expect, test, describe, mock, beforeEach } from "bun:test";

// Mock executors
mock.module("../../../src/mutations/create-executor", () => ({
  executeCreateOneMutation: mock(async () => ({ id: 1 })),
  executeCreateManyMutation: mock(async () => [{ id: 1 }]),
}));

mock.module("../../../src/mutations/single-executor", () => ({
  executeSingleMutation: mock(async (ctx: any, baseTable: any, pkName: string, mutationFn: any, id: any) => {
    return { id };
  }),
}));

mock.module("../../../src/mutations/batch-executor", () => ({
  executeBatchMutation: mock(async () => {
    return [{ id: 1 }];
  }),
}));

// Mock helpers
mock.module("../../../src/helper", () => ({
  getPrimaryKeyColumnName: mock(() => "id"),
  injectSoftDeleteFilter: mock(async (q) => q),
  findBaseTable: mock(() => ({ id: { name: "id" } })),
  resolveProviderValues: mock(async () => ({})),
  getSoftDeleteConfig: mock(() => ({ column: "deleted", deleteValue: 1 })),
}));

mock.module("../../../src/helper/dialect-helper", () => ({
  supportsReturning: mock(() => true),
}));

import { executeCreateOne, executeCreateMany } from "../../../src/mutations/create";
import { executeUpdateOne, executeUpdateMany } from "../../../src/mutations/update";
import { executeSoftDeleteOne, executeSoftDeleteMany } from "../../../src/mutations/soft-delete";
import { executeRestoreOne, executeRestoreMany } from "../../../src/mutations/restore";
import { executeHardDeleteOne, executeHardDeleteMany } from "../../../src/mutations/delete";

describe("Mutation Entry Points", () => {
  const mockTable = { id: { name: "id" } } as any;
  const mockContext = {
    params: { id: 1, data: { name: "Test" }, filter: {}, query: {} },
    tableName: "users",
    traceId: "trace-123",
    state: {},
    translatorContext: {
      db: {},
      metadata: { users: {} },
      baseTableName: "users",
      emitter: { emit: mock() }
    }
  } as any;

  test("executeCreateOne", async () => {
    const ctx = { ...mockContext, action: "create" };
    const res = await executeCreateOne(ctx, mockTable);
    expect(res).toEqual({ id: 1 });
  });

  test("executeCreateMany", async () => {
    const ctx = { ...mockContext, action: "create" };
    const res = await executeCreateMany(ctx, mockTable);
    expect(res).toEqual([{ id: 1 }]);
  });

  test("executeUpdateOne", async () => {
    const ctx = { ...mockContext, action: "update", params: { ...mockContext.params, set: { name: "New" } } };
    const res = await executeUpdateOne(ctx, mockTable);
    expect(res).toEqual({ id: 1 });
  });

  test("executeUpdateMany", async () => {
    const ctx = { ...mockContext, action: "update", params: { ...mockContext.params, set: { name: "New" } } };
    const res = await executeUpdateMany(ctx, mockTable);
    expect(res).toEqual([{ id: 1 }]);
  });

  test("executeSoftDeleteOne", async () => {
    const ctx = { ...mockContext, action: "softDelete" };
    const res = await executeSoftDeleteOne(ctx, mockTable);
    expect(res).toBe(true);
    expect(ctx.translatorContext.emitter.emit).toHaveBeenCalledWith("soft-deleted", expect.anything());
  });

  test("executeSoftDeleteMany", async () => {
    const ctx = { ...mockContext, action: "softDelete" };
    const res = await executeSoftDeleteMany(ctx, mockTable);
    expect(res).toBe(1);
    expect(ctx.translatorContext.emitter.emit).toHaveBeenCalledWith("soft-deleted", expect.anything());
  });

  test("executeRestoreOne", async () => {
    const ctx = { ...mockContext, action: "restore" };
    const res = await executeRestoreOne(ctx, mockTable);
    expect(res).toBe(true);
    expect(ctx.translatorContext.emitter.emit).toHaveBeenCalledWith("restored", expect.anything());
  });

  test("executeRestoreMany", async () => {
    const ctx = { ...mockContext, action: "restore" };
    const res = await executeRestoreMany(ctx, mockTable);
    expect(res).toBe(1);
    expect(ctx.translatorContext.emitter.emit).toHaveBeenCalledWith("restored", expect.anything());
  });

  test("executeHardDeleteOne", async () => {
    const ctx = { ...mockContext, action: "hardDelete" };
    const res = await executeHardDeleteOne(ctx, mockTable);
    expect(res).toBe(true);
    expect(ctx.translatorContext.emitter.emit).toHaveBeenCalledWith("hard-deleted", expect.anything());
  });

  test("executeHardDeleteOne returns false if no ID", async () => {
    const ctx = { ...mockContext, action: "hardDelete", params: { ...mockContext.params, id: undefined } };
    const res = await executeHardDeleteOne(ctx, mockTable);
    expect(res).toBe(false);
  });

  test("executeUpdateOne returns null if missing params", async () => {
    const res = await executeUpdateOne({ ...mockContext, params: {} }, mockTable);
    expect(res).toBeNull();
  });

  test("executeUpdateMany returns empty if missing params", async () => {
    const res = await executeUpdateMany({ ...mockContext, params: {} }, mockTable);
    expect(res).toEqual([]);
  });

  test("executeSoftDeleteOne returns false if executor returns null", async () => {
    const { executeSingleMutation } = require("../../../src/mutations/single-executor");
    executeSingleMutation.mockImplementationOnce(async () => null);
    const res = await executeSoftDeleteOne(mockContext, mockTable);
    expect(res).toBe(false);
  });

  test("executeRestoreOne returns false if executor returns null", async () => {
    const { executeSingleMutation } = require("../../../src/mutations/single-executor");
    executeSingleMutation.mockImplementationOnce(async () => null);
    const res = await executeRestoreOne(mockContext, mockTable);
    expect(res).toBe(false);
  });

  test("executeHardDeleteMany returns 0 if no records affected", async () => {
    const { executeBatchMutation } = require("../../../src/mutations/batch-executor");
    executeBatchMutation.mockImplementationOnce(async () => []);
    const res = await executeHardDeleteMany(mockContext, mockTable);
    expect(res).toBe(0);
  });

  test("executeHardDeleteMany returns count if records affected", async () => {
    const { executeBatchMutation } = require("../../../src/mutations/batch-executor");
    executeBatchMutation.mockImplementationOnce(async () => [{ id: 1 }, { id: 2 }]);
    const res = await executeHardDeleteMany(mockContext, mockTable);
    expect(res).toBe(2);
    expect(mockContext.translatorContext.emitter.emit).toHaveBeenCalledWith("hard-deleted", expect.anything());
  });
});
