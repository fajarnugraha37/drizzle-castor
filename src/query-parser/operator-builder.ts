import {
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  between,
  notBetween,
  like,
  ilike,
  notLike,
  notIlike,
  arrayContains,
  arrayContained,
  arrayOverlaps,
  SQL,
  sql,
  and,
  or,
  not,
} from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getDialect } from "../helper";
import { QueryParsingError } from "../errors";
import { logger } from "../helper/logger-helper";

/**
 * Maps a single NoSQL-like operator to a Drizzle SQL condition.
 * @param column The Drizzle Column instance
 * @param operator The string operator (e.g., "$eq", "$ilike")
 * @param value The value associated with the operator
 * @param db The database instance to detect dialect
 */
export function buildFieldOperator(
  column: AnyColumn,
  operator: string,
  value: any,
  db: any,
): SQL | undefined {
  if (value === undefined) return undefined;

  logger.trace(`Building field operator: ${operator}`);
  const dialect = getDialect(db);
  const isSQLite = dialect === "sqlite";

  switch (operator) {
    case "$eq":
      return eq(column, value);
    case "$ne":
      return ne(column, value);
    case "$gt":
      return gt(column, value);
    case "$gte":
      return gte(column, value);
    case "$lt":
      return lt(column, value);
    case "$lte":
      return lte(column, value);
    case "$isNull":
      return value ? isNull(column) : isNotNull(column);
    case "$isNotNull":
    case "$notIsNull":
      return value ? isNotNull(column) : isNull(column);
    case "$in":
    case "$inArray":
      return Array.isArray(value) && value.length > 0
        ? inArray(column, value)
        : undefined;
    case "$notIn":
    case "$notInArray":
      return Array.isArray(value) && value.length > 0
        ? notInArray(column, value)
        : undefined;
    case "$between":
      return Array.isArray(value) && value.length === 2
        ? between(column, value[0], value[1])
        : undefined;
    case "$notBetween":
      return Array.isArray(value) && value.length === 2
        ? notBetween(column, value[0], value[1])
        : undefined;
    case "$like":
      return like(column, value);
    case "$ilike":
      // MySQL is case-insensitive by default for most collations, and doesn't support ILIKE keyword.
      return isSQLite || dialect === "mysql" ? like(column, value) : ilike(column, value);
    case "$notLike":
      return notLike(column, value);
    case "$notIlike":
      return isSQLite || dialect === "mysql" ? notLike(column, value) : notIlike(column, value);
    case "$arrayContains":
      if (!Array.isArray(value)) return undefined;
      const acDialect = getDialect(db);
      if (acDialect === "mysql") {
        // MySQL JSON_CONTAINS(column, target_json)
        return sql`JSON_CONTAINS(${column}, ${JSON.stringify(value)})`;
      }
      let acCol = column;
      let acVal: any = value;
      if (getDialect(db) === "pg" && (column as any).isJsonExtraction) {
        acCol = sql`(${column as any})::jsonb` as any;
        acVal = sql`${JSON.stringify(value)}::jsonb`;
      }
      return arrayContains(acCol as any, acVal);
    case "$arrayContained":
      if (!Array.isArray(value)) return undefined;
      let adCol = column;
      let adVal: any = value;
      if (getDialect(db) === "pg" && (column as any).isJsonExtraction) {
        adCol = sql`(${column as any})::jsonb` as any;
        adVal = sql`${JSON.stringify(value)}::jsonb`;
      }
      return arrayContained(adCol as any, adVal);
    case "$arrayOverlaps":
      if (!Array.isArray(value)) return undefined;
      let aoCol = column;
      let aoVal: any = value;
      if (getDialect(db) === "pg" && (column as any).isJsonExtraction) {
        aoCol = sql`(${column as any})::jsonb` as any;
        aoVal = sql`${JSON.stringify(value)}::jsonb`;
      }
      return arrayOverlaps(aoCol as any, aoVal);
    default:
      // FIX LOW: Throw error for unknown $ operators to help users debug typos.
      if (operator.startsWith("$")) {
        throw new QueryParsingError(`Unknown operator: ${operator}`);
      }
      return undefined;
  }
}

/**
 * Builds logical conjunctions (AND, OR, NOT) using Drizzle's helpers.
 * Cleans up empty or undefined conditions.
 */
export function buildConjunction(
  type: "$and" | "$or" | "$not",
  conditions: (SQL | undefined)[],
): SQL | undefined {
  const validConditions = conditions.filter((c): c is SQL => c !== undefined);

  if (validConditions.length === 0) return undefined;

  logger.trace(`Building conjunction: ${type} (${validConditions.length} conditions)`);

  switch (type) {
    case "$and":
      return validConditions.length === 1
        ? validConditions[0]
        : and(...validConditions);
    case "$or":
      return validConditions.length === 1
        ? validConditions[0]
        : or(...validConditions);
    case "$not":
      return validConditions.length > 0 ? not(validConditions[0]!) : undefined;
    default:
      return undefined;
  }
}
