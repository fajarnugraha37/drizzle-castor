import { expect, test, describe, mock, beforeEach } from "bun:test";

// Mock query-parser
mock.module("../../../src/query-parser", () => ({
  buildSearchQueries: mock(async () => ({
    mainQuery: Promise.resolve([{ id: 1 }]),
    countQuery: Promise.resolve([{ count: 10 }]),
    paths: []
  })),
  hydrateResults: mock((rows) => rows),
}));

// Mock helpers
mock.module("../../../src/helper", () => ({
  getPrimaryKeyColumnName: mock(() => "id"),
  injectSoftDeleteFilter: mock(async (q) => q),
  findBaseTable: mock(() => ({ id: { name: "id" } })),
}));

import { executeSearchOne, executeSearchPage, executeSearchMany } from "../../../src/queries/search";
import { executeSearchDeletedOne, executeSearchDeletedPage, executeSearchDeletedMany } from "../../../src/queries/search-deleted";

describe("Query Entry Points", () => {
  const mockContext = {
    params: { query: { page: 2, pageSize: 5 } },
    tableName: "users",
    translatorContext: {
      db: {},
      metadata: { users: {} },
      tables: [],
      baseTableName: "users"
    }
  } as any;

  describe("Standard Search", () => {
    test("executeSearchOne", async () => {
      const res = await executeSearchOne(mockContext);
      expect(res).toEqual({ id: 1 });
    });

    test("executeSearchMany", async () => {
      const res = await executeSearchMany(mockContext);
      expect(res).toEqual([{ id: 1 }]);
    });

    test("executeSearchPage", async () => {
      const res = await executeSearchPage(mockContext);
      expect(res.data).toEqual([{ id: 1 }]);
      expect(res.meta).toEqual({
        currentPage: 2,
        pageSize: 5,
        totalItems: 10,
        totalPages: 2
      });
    });

    test("executeSearchPage handles 0 items", async () => {
      const { buildSearchQueries } = require("../../../src/query-parser");
      buildSearchQueries.mockImplementationOnce(async () => ({
        mainQuery: Promise.resolve([]),
        countQuery: Promise.resolve([{ count: 0 }]),
        paths: []
      }));

      const res = await executeSearchPage(mockContext);
      expect(res.data).toEqual([]);
      expect(res.meta.totalItems).toBe(0);
    });
  });

  describe("Deleted Search", () => {
    test("executeSearchDeletedOne", async () => {
      const res = await executeSearchDeletedOne(mockContext);
      expect(res).toEqual({ id: 1 });
    });

    test("executeSearchDeletedMany", async () => {
      const res = await executeSearchDeletedMany(mockContext);
      expect(res).toEqual([{ id: 1 }]);
    });

    test("executeSearchDeletedPage", async () => {
      const res = await executeSearchDeletedPage(mockContext);
      expect(res.data).toEqual([{ id: 1 }]);
      expect(res.meta.totalItems).toBe(10);
    });

    test("executeSearchDeletedPage handles 0 items", async () => {
      const { buildSearchQueries } = require("../../../src/query-parser");
      buildSearchQueries.mockImplementationOnce(async () => ({
        mainQuery: Promise.resolve([]),
        countQuery: Promise.resolve([{ count: 0 }]),
        paths: []
      }));

      const res = await executeSearchDeletedPage(mockContext);
      expect(res.data).toEqual([]);
      expect(res.meta.totalItems).toBe(0);
    });
  });
});
