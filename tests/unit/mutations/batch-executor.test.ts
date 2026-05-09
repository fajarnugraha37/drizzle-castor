import { expect, test, describe, mock, beforeEach } from "bun:test";

// We MUST mock before importing the code that uses the mocked module
mock.module("../../../src/helper/dialect-helper", () => ({
  getDialect: mock(() => "mysql"),
  generateTempTableName: mock(() => "_tmp_test"),
  supportsReturning: mock(() => false),
  getTempTableCount: mock(async () => 1)
}));

mock.module("../../../src/query-parser", () => ({
  buildSearchQueries: mock(async () => ({ 
    mainQuery: { 
      innerJoin: mock(() => Promise.resolve([{ users: { id: 1 } }])) 
    }, 
    paths: [] 
  })),
  hydrateResults: mock(() => [{ id: 1 }]),
  parseFilter: mock(() => ({})),
  isFilterSimple: mock(() => true),
  buildExistsCondition: mock(async () => ({}))
}));

import { executeBatchMutation } from "../../../src/mutations/batch-executor";
import * as dialectHelper from "../../../src/helper/dialect-helper";
import * as queryParser from "../../../src/query-parser";
import { MutationError } from "../../../src/errors";

describe("Batch Executor", () => {
  const mockTable = {
    id: { name: "id" },
    _name: "users"
  };
  
  const mockContext = {
    params: { query: {} },
    translatorContext: {
      db: {
        transaction: mock(async (cb: any) => cb(mockTx)),
      },
      metadata: {
        users: {}
      },
      tables: [mockTable],
      baseTableName: "users"
    },
    state: {}
  } as any;

  const mockTx = {
    execute: mock(async () => ({})),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({})),
      })),
    })),
  } as any;

  beforeEach(() => {
    mockTx.execute.mockClear();
    // @ts-ignore
    dialectHelper.supportsReturning.mockImplementation(() => false);
    // @ts-ignore
    dialectHelper.getTempTableCount.mockImplementation(async () => 1);
  });

  const containsSql = (calls: any[], substring: string) => {
    return calls.some(call => {
      const sqlObj = call[0];
      const str = JSON.stringify(sqlObj);
      return str.includes(substring);
    });
  };

  describe("Strategy B (Universal Fallback / No Returning)", () => {
    test("Successfully executes mutation and cleanup", async () => {
      const mutationFn = mock(async () => 1);
      
      const result = await executeBatchMutation(
        mockContext,
        mockTable,
        "id",
        mutationFn,
        {}
      );

      expect(result).toEqual([{ id: 1 }]);
      expect(containsSql(mockTx.execute.mock.calls, "CREATE TEMPORARY TABLE")).toBe(true);
      expect(containsSql(mockTx.execute.mock.calls, "DROP TEMPORARY TABLE")).toBe(true);
    });

    test("Ensures cleanup and error wrapping on failure", async () => {
      const mutationFn = mock(async () => {
        throw new Error("DB Crash");
      });

      try {
        await executeBatchMutation(
          mockContext,
          mockTable,
          "id",
          mutationFn,
          {}
        );
      } catch (e: any) {
        expect(e).toBeInstanceOf(MutationError);
        expect(e.message).toContain("Batch mutation failed (fallback)");
      }

      expect(containsSql(mockTx.execute.mock.calls, "DROP TEMPORARY TABLE")).toBe(true);
    });

    test("Returns empty if no records captured", async () => {
      // Mock capture count to 0
      // @ts-ignore
      dialectHelper.getTempTableCount.mockImplementation(async () => 0);
      
      const mutationFn = mock(async () => 1);
      
      const result = await executeBatchMutation(
        mockContext,
        mockTable,
        "id",
        mutationFn,
        {}
      );

      expect(result).toEqual([]);
    });
  });

  describe("Strategy A (Returning Supported)", () => {
    test("Uses .returning() for hydration", async () => {
      // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => true);

      const mutationFn = mock(async () => [1]);
      
      const result = await executeBatchMutation(
        mockContext,
        mockTable,
        "id",
        mutationFn,
        {}
      );

      expect(result).toEqual([{ id: 1 }]);
      expect(mockTx.execute).not.toHaveBeenCalled();
    });
  });
});
