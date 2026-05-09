import { expect, test, describe, mock, beforeEach } from "bun:test";

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

import { executeSingleMutation } from "../../../src/mutations/single-executor";
import * as dialectHelper from "../../../src/helper/dialect-helper";
import * as queryParser from "../../../src/query-parser";
import { MutationError } from "../../../src/errors";

describe("Single Executor", () => {
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
      
      const result = await executeSingleMutation(
        mockContext,
        mockTable,
        "id",
        mutationFn,
        1
      );

      expect(result).toEqual({ id: 1 });
      expect(containsSql(mockTx.execute.mock.calls, "CREATE TEMPORARY TABLE")).toBe(true);
      expect(containsSql(mockTx.execute.mock.calls, "DROP TEMPORARY TABLE")).toBe(true);
    });

    test("Ensures cleanup and error wrapping on failure", async () => {
      const mutationFn = mock(async () => {
        throw new Error("DB Crash");
      });

      try {
        await executeSingleMutation(
          mockContext,
          mockTable,
          "id",
          mutationFn,
          1
        );
      } catch (e: any) {
        expect(e).toBeInstanceOf(MutationError);
        expect(e.message).toContain("Single mutation failed (fallback)");
      }

      expect(containsSql(mockTx.execute.mock.calls, "DROP TEMPORARY TABLE")).toBe(true);
    });

    test("Returns null if no records captured", async () => {
      // @ts-ignore
      dialectHelper.getTempTableCount.mockImplementation(async () => 0);
      
      const result = await executeSingleMutation(
        mockContext,
        mockTable,
        "id",
        mock(async () => 1),
        1
      );

      expect(result).toBeNull();
    });
  });

  describe("Strategy A (Returning Supported)", () => {
    test("Uses .returning() and respects operationFilter", async () => {
      // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => true);

      const mutationFn = mock(async () => [1]);
      
      const result = await executeSingleMutation(
        mockContext,
        mockTable,
        "id",
        mutationFn,
        1,
        { status: { $eq: "active" } }
      );

      expect(result).toEqual({ id: 1 });
      expect(mockTx.execute).not.toHaveBeenCalled();
    });
  });
});
