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
  and,
  or,
  not,
} from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { getDialect } from "../helper";
import { QueryParsingError } from "../errors";

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
      // SQLite doesn't natively support ILIKE
      return isSQLite ? like(column, value) : ilike(column, value);
    case "$notLike":
      return notLike(column, value);
    case "$notIlike":
      return isSQLite ? notLike(column, value) : notIlike(column, value);
    case "$arrayContains":
      return Array.isArray(value) ? arrayContains(column, value) : undefined;
    case "$arrayContained":
      return Array.isArray(value) ? arrayContained(column, value) : undefined;
    case "$arrayOverlaps":
      return Array.isArray(value) ? arrayOverlaps(column, value) : undefined;
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
