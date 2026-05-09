import { expect, test, describe } from "bun:test";
import { 
  defineFilter, 
  defineQuery, 
  defineUpdateSet, 
  defineProjection, 
  defineInsertValue 
} from "../../../src/helper";

describe("Types: Identity Helpers", () => {
  test("defineFilter should return the filter as-is", () => {
    const filter = { id: { $eq: 1 } };
    expect(defineFilter(filter)).toBe(filter);
  });

  test("defineQuery should return the query as-is", () => {
    const query = { filter: { id: { $eq: 1 } }, page: 1 };
    expect(defineQuery(query)).toBe(query);
  });

  test("defineUpdateSet should return the set as-is", () => {
    const set = { name: "John" };
    expect(defineUpdateSet(set)).toBe(set);
  });

  test("defineProjection should return the projection as-is", () => {
    const projection = ["id", "name"];
    expect(defineProjection(projection as any)).toBe(projection);
  });

  test("defineInsertValue should return the data as-is", () => {
    const data = { id: 1, name: "John" };
    expect(defineInsertValue(data)).toBe(data);
  });
});
