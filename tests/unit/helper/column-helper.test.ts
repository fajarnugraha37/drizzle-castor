import { expect, test, describe } from "bun:test";
import { getPrimaryKeyColumnName } from "../../../src/helper/column-helper";
import { pgTable, serial, primaryKey } from "drizzle-orm/pg-core";

describe("column-helper", () => {
  describe("getPrimaryKeyColumnName", () => {
    test("should return the column-level primary key", () => {
      const testTable = pgTable("test_col_pk", {
        uuid: serial("uuid").primaryKey(),
      });
      expect(getPrimaryKeyColumnName(testTable)).toBe("uuid");
    });

    test("should return the table-level primary key", () => {
      const testTable = pgTable("test_table_pk", {
        id: serial("id"),
      }, (table) => ({
        pk: primaryKey({ columns: [table.id] }),
      }));
      expect(getPrimaryKeyColumnName(testTable)).toBe("id");
    });

    test("should fallback to 'id' if no primary key is explicitly marked", () => {
      const testTable = pgTable("test_no_pk", {
        name: serial("name"),
      });
      expect(getPrimaryKeyColumnName(testTable)).toBe("id");
    });

    test("should return the first primary key for composite keys", () => {
      const testTable = pgTable("test_composite_pk", {
        tenantId: serial("tenant_id"),
        userId: serial("user_id"),
      }, (table) => ({
        pk: primaryKey({ columns: [table.tenantId, table.userId] }),
      }));
      
      const pk = getPrimaryKeyColumnName(testTable);
      expect(["tenantId", "userId"]).toContain(pk);
    });
  });
});
