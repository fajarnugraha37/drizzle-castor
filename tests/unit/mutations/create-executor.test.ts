import { expect, test, describe, mock, beforeEach } from "bun:test";

// Mock dialect-helper
mock.module("../../../src/helper/dialect-helper", () => ({
  supportsReturning: mock(() => true),
}));

// Mock query-parser
mock.module("../../../src/query-parser", () => ({
  buildSearchQueries: mock(async () => ({
    mainQuery: Promise.resolve([{ id: 1, name: "Test" }]),
    paths: []
  })),
  hydrateResults: mock((rows) => rows),
}));

import { executeCreateOneMutation, executeCreateManyMutation } from "../../../src/mutations/create-executor";
import * as dialectHelper from "../../../src/helper/dialect-helper";
import * as queryParser from "../../../src/query-parser";
import { MutationError } from "../../../src/errors";

describe("Create Executor", () => {
  const mockTable = { _name: "users" };
  const mockTx = {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(() => Promise.resolve([{ id: 1 }]))
      }))
    }))
  } as any;

  const mockContext = {
    translatorContext: {
      db: {
        transaction: mock(async (cb: any) => cb(mockTx)),
      },
      metadata: { users: {} },
      baseTableName: "users"
    }
  } as any;

  beforeEach(() => {
    mockTx.insert.mockClear();
    // @ts-ignore
    dialectHelper.supportsReturning.mockImplementation(() => true);
    // @ts-ignore
    queryParser.buildSearchQueries.mockImplementation(async () => ({
      mainQuery: Promise.resolve([{ id: 1, name: "Test" }]),
      paths: []
    }));
  });

  describe("executeCreateOneMutation", () => {
    test("Success with .returning() (Postgres/SQLite style)", async () => {
      const result = await executeCreateOneMutation(mockContext, mockTable, "id", { name: "Test" });
      
      expect(result).toEqual({ id: 1, name: "Test" });
      expect(mockTx.insert).toHaveBeenCalledWith(mockTable);
    });

    test("Success with insertId fallback (MySQL style)", async () => {
      // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => false);
      
      const mysqlMockTx = {
        insert: mock(() => ({
          values: mock(() => Promise.resolve([{ insertId: 10 }]))
        }))
      } as any;
      const mysqlContext = { 
        translatorContext: { 
          ...mockContext.translatorContext, 
          db: { transaction: mock(async (cb: any) => cb(mysqlMockTx)) } 
        } 
      } as any;

      // Mock buildSearchQueries to return a specific row based on filter
      // @ts-ignore
      queryParser.buildSearchQueries.mockImplementationOnce(async (params) => {
        expect(params.filter.id.$eq).toBe(10);
        return { mainQuery: Promise.resolve([{ id: 10, name: "MySQL" }]), paths: [] };
      });

      const result = await executeCreateOneMutation(mysqlContext, mockTable, "id", { name: "MySQL" });
      expect(result).toEqual({ id: 10, name: "MySQL" });
    });

    test("Returns null if returning() is empty", async () => {
       mockTx.insert.mockImplementation(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([]))
        }))
      }));
      const result = await executeCreateOneMutation(mockContext, mockTable, "id", { name: "Test" });
      expect(result).toBeNull();
    });

    test("Returns null if insertId is missing (MySQL style)", async () => {
       // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => false);
      const mysqlMockTx = {
        insert: mock(() => ({
          values: mock(() => Promise.resolve([{ insertId: undefined }]))
        }))
      } as any;
      const mysqlContext = { 
        translatorContext: { 
          ...mockContext.translatorContext, 
          db: { transaction: mock(async (cb: any) => cb(mysqlMockTx)) } 
        } 
      } as any;

      const result = await executeCreateOneMutation(mysqlContext, mockTable, "id", { name: "MySQL" });
      expect(result).toBeNull();
    });

    test("Wraps generic error in MutationError", async () => {
      mockTx.insert.mockImplementation(() => { throw new Error("Connection Lost"); });
      
      expect(executeCreateOneMutation(mockContext, mockTable, "id", {}))
        .rejects.toThrow(MutationError);
    });

    test("Rethrows MutationError directly", async () => {
      mockTx.insert.mockImplementation(() => { throw new MutationError("Specific Error"); });
      
      try {
        await executeCreateOneMutation(mockContext, mockTable, "id", {});
      } catch (e: any) {
        expect(e).toBeInstanceOf(MutationError);
        expect(e.message).toBe("Specific Error");
      }
    });
  });

  describe("executeCreateManyMutation", () => {
    test("Success with .returning()", async () => {
      const manyMockTx = {
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(() => Promise.resolve([{ id: 1 }, { id: 2 }]))
          }))
        }))
      } as any;
      const manyContext = { 
        translatorContext: { 
          ...mockContext.translatorContext, 
          db: { transaction: mock(async (cb: any) => cb(manyMockTx)) } 
        } 
      } as any;

      // @ts-ignore
      queryParser.buildSearchQueries.mockImplementationOnce(async () => ({
        mainQuery: Promise.resolve([{ id: 1 }, { id: 2 }]),
        paths: []
      }));

      const result = await executeCreateManyMutation(manyContext, mockTable, "id", [{ name: "A" }, { name: "B" }]);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    test("Success with MySQL contiguous ID logic", async () => {
      // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => false);
      
      const mysqlMockTx = {
        insert: mock(() => ({
          values: mock(() => Promise.resolve([{ insertId: 100, affectedRows: 3 }]))
        }))
      } as any;
      const mysqlContext = { 
        translatorContext: { 
          ...mockContext.translatorContext, 
          db: { transaction: mock(async (cb: any) => cb(mysqlMockTx)) } 
        } 
      } as any;

       // @ts-ignore
      queryParser.buildSearchQueries.mockImplementationOnce(async (params) => {
        expect(params.filter.id.$inArray).toEqual([100, 101, 102]);
        return { mainQuery: Promise.resolve([{ id: 100 }, { id: 101 }, { id: 102 }]), paths: [] };
      });

      const result = await executeCreateManyMutation(mysqlContext, mockTable, "id", [{}, {}, {}]);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(100);
      expect(result[2].id).toBe(102);
    });

    test("Returns empty array for empty data", async () => {
      const result = await executeCreateManyMutation(mockContext, mockTable, "id", []);
      expect(result).toEqual([]);
    });

    test("Returns empty array if no IDs captured (MySQL)", async () => {
      // @ts-ignore
      dialectHelper.supportsReturning.mockImplementation(() => false);
      const mysqlMockTx = {
        insert: mock(() => ({
          values: mock(() => Promise.resolve([{ insertId: 0, affectedRows: 0 }]))
        }))
      } as any;
      const mysqlContext = { 
        translatorContext: { 
          ...mockContext.translatorContext, 
          db: { transaction: mock(async (cb: any) => cb(mysqlMockTx)) } 
        } 
      } as any;

      const result = await executeCreateManyMutation(mysqlContext, mockTable, "id", [{}]);
      expect(result).toEqual([]);
    });

    test("Wraps generic error in MutationError for Many", async () => {
      mockTx.insert.mockImplementation(() => { throw new Error("Batch Failure"); });
      
      expect(executeCreateManyMutation(mockContext, mockTable, "id", [{}]))
        .rejects.toThrow(MutationError);
    });

    test("Rethrows MutationError directly for Many", async () => {
      mockTx.insert.mockImplementation(() => { throw new MutationError("Specific Batch Error"); });
      
      try {
        await executeCreateManyMutation(mockContext, mockTable, "id", [{}]);
      } catch (e: any) {
        expect(e).toBeInstanceOf(MutationError);
        expect(e.message).toBe("Specific Batch Error");
      }
    });
  });
});
