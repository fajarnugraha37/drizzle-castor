import { expect, test, describe, mock, beforeEach } from "bun:test";
import { executeUpdateOne, executeUpdateMany } from "../../../src/mutations/update";
import { executeSoftDeleteOne, executeSoftDeleteMany } from "../../../src/mutations/soft-delete";
import { executeRestoreOne, executeRestoreMany } from "../../../src/mutations/restore";
import { executeHardDeleteOne, executeHardDeleteMany } from "../../../src/mutations/delete";

// Mock ONLY the low-level DB calls and dialect helper, NOT the executors
mock.module("../../../src/helper/dialect-helper", () => ({
  supportsReturning: mock(() => true),
  getDialect: mock(() => "pg"),
  generateTempTableName: mock(() => "tmp"),
}));

mock.module("../../../src/query-parser", () => ({
  parseUpdateSet: mock((db, table, set) => set),
  injectSoftDeleteFilter: mock(async (q) => q),
  buildSearchQueries: mock(async () => ({ 
    mainQuery: Promise.resolve([{ id: 1 }]), 
    paths: [] 
  })),
  hydrateResults: mock(() => [{ id: 1 }]),
  buildExistsCondition: mock(async () => ({})),
}));

// We need to mock the executor return values but LET THEM CALL the mutationFn
mock.module("../../../src/mutations/single-executor", () => ({
  executeSingleMutation: mock(async (ctx, table, pk, mutationFn, id) => {
    // Call the actual mutationFn to get coverage
    await mutationFn({
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id }]) }) }) }),
      delete: () => ({ where: () => ({ returning: () => Promise.resolve([{ id }]) }) })
    }, {});
    return { id };
  }),
}));

mock.module("../../../src/mutations/batch-executor", () => ({
  executeBatchMutation: mock(async (ctx, table, pk, mutationFn) => {
    await mutationFn({
      update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) }) }),
      delete: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) })
    }, {});
    return [{ id: 1 }];
  }),
}));

describe("Mutation Callback Logic Coverage", () => {
  const mockTable = { id: { name: "id" } } as any;
  const mockContext = {
    params: { id: 1, set: { name: "New" }, filter: {} },
    tableName: "users",
    translatorContext: {
      db: {},
      metadata: { users: { softDelete: { column: "deleted", deleteValue: 1, restoreValue: 0 } } },
      baseTableName: "users",
    },
    state: {}
  } as any;

  test("Covers mutationFn in updateOne", async () => {
    await executeUpdateOne(mockContext, mockTable);
  });

  test("Covers mutationFn in updateMany", async () => {
    await executeUpdateMany(mockContext, mockTable);
  });

  test("Covers mutationFn in softDeleteOne", async () => {
    await executeSoftDeleteOne(mockContext, mockTable);
  });

  test("Covers mutationFn in softDeleteMany", async () => {
    await executeSoftDeleteMany(mockContext, mockTable);
  });

  test("Covers mutationFn in restoreOne", async () => {
    await executeRestoreOne(mockContext, mockTable);
  });

  test("Covers mutationFn in restoreMany", async () => {
    await executeRestoreMany(mockContext, mockTable);
  });

  test("Covers mutationFn in hardDeleteOne", async () => {
    await executeHardDeleteOne(mockContext, mockTable);
  });

  test("Covers mutationFn in hardDeleteMany", async () => {
    await executeHardDeleteMany(mockContext, mockTable);
  });

  describe("Non-RETURNING dialect", () => {
    beforeEach(() => {
      const { supportsReturning } = require("../../../src/helper/dialect-helper");
      supportsReturning.mockImplementation(() => false);

      const { executeSingleMutation } = require("../../../src/mutations/single-executor");
      executeSingleMutation.mockImplementation(async (ctx, table, pk, mutationFn, id) => {
        await mutationFn({
          update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) }),
          delete: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) })
        }, {});
        return { id };
      });

      const { executeBatchMutation } = require("../../../src/mutations/batch-executor");
      executeBatchMutation.mockImplementation(async (ctx, table, pk, mutationFn) => {
        await mutationFn({
          update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) }),
          delete: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) })
        }, {});
        return [{ id: 1 }];
      });
    });

    test("Covers non-returning updateOne", async () => {
      await executeUpdateOne(mockContext, mockTable);
    });

    test("Covers non-returning updateMany", async () => {
      await executeUpdateMany(mockContext, mockTable);
    });
  });
});
