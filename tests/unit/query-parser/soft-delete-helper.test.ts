import { expect, test, describe } from "bun:test";
import { resolveProviderValues, injectSoftDeleteFilter } from "../../../src/query-parser/soft-delete-helper";

describe("Query Parser: Soft Delete Helper", () => {
  describe("resolveProviderValues", () => {
    test("Resolves static objects", async () => {
      const res = await resolveProviderValues({ a: 1, b: "test" });
      expect(res).toEqual({ a: 1, b: "test" });
    });

    test("Resolves functions", async () => {
      const res = await resolveProviderValues({ a: () => 2, b: "test" });
      expect(res).toEqual({ a: 2, b: "test" });
    });

    test("Returns empty object if config is undefined", async () => {
      const res = await resolveProviderValues(undefined);
      expect(res).toEqual({});
    });
  });

  describe("injectSoftDeleteFilter", () => {
    const metadata = {
      users: {
        softDelete: {
          deleteValue: { isDeleted: true },
          restoreValue: { isDeleted: false }
        }
      },
      posts: {
        softDelete: {
          deleteValue: { deletedAt: () => new Date() }
        }
      }
    };

    test("Does nothing if no soft delete config", async () => {
      const query = { filter: { a: 1 } };
      const res = await injectSoftDeleteFilter(query, metadata, "unknown", "active");
      expect(res).toEqual({ filter: { a: 1 } });
    });

    test("Active mode (static deleteValue): injects != val OR IS NULL", async () => {
      const query = { filter: {} };
      const res = await injectSoftDeleteFilter(query, metadata, "users", "active");
      expect(res.filter).toBeDefined();
      expect(res.filter.$and).toBeDefined();
      const condition = res.filter.$and[0].$or;
      expect(condition).toBeDefined();
      expect(condition[0].isDeleted.$ne).toBe(true);
      expect(condition[1].isDeleted.$isNull).toBe(true);
    });

    test("Active mode (dynamic deleteValue): injects IS NULL", async () => {
      const query = { filter: {} };
      const res = await injectSoftDeleteFilter(query, metadata, "posts", "active");
      expect(res.filter).toBeDefined();
      expect(res.filter.$and).toBeDefined();
      expect(res.filter.$and[0].deletedAt.$isNull).toBe(true);
    });

    test("Deleted mode (static deleteValue): injects == val", async () => {
      const query = { filter: {} };
      const res = await injectSoftDeleteFilter(query, metadata, "users", "deleted");
      expect(res.filter).toBeDefined();
      expect(res.filter.$and).toBeDefined();
      expect(res.filter.$and[0].isDeleted.$eq).toBe(true);
    });

    test("Deleted mode (dynamic deleteValue): injects IS NOT NULL", async () => {
      const query = { filter: {} };
      const res = await injectSoftDeleteFilter(query, metadata, "posts", "deleted");
      expect(res.filter).toBeDefined();
      expect(res.filter.$and).toBeDefined();
      expect(res.filter.$and[0].deletedAt.$notIsNull).toBe(true);
    });

    test("Merges softly with existing filter", async () => {
      const query = { filter: { name: { $eq: "John" } } };
      const res = await injectSoftDeleteFilter(query, metadata, "users", "active");
      expect(res.filter.$and.length).toBe(2);
      expect(res.filter.$and[0]).toEqual({ name: { $eq: "John" } });
    });
  });
});