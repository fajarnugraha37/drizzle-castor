import type { CastorErrorCode } from "../types";
import { CastorError } from "./base";

export class QueryParsingError extends CastorError {
  constructor(message: string, code: CastorErrorCode = "QUERY_PARSING_ERROR", details?: any) {
    super(message, code, details);
  }
}

export class TableNotFoundError extends QueryParsingError {
  constructor(tableName: string) {
    super(`Table '${tableName}' not found`, "TABLE_NOT_FOUND");
  }
}

export class ColumnNotFoundError extends QueryParsingError {
  constructor(message: string) {
    super(message, "COLUMN_NOT_FOUND");
  }
}

export class RelationNotFoundError extends QueryParsingError {
  constructor(relationName: string, tableName: string) {
    super(
      `Relation '${relationName}' not found on table '${tableName}'`,
      "RELATION_NOT_FOUND",
    );
  }
}

export class AliasNotFoundError extends QueryParsingError {
  constructor(message: string) {
    super(message, "ALIAS_NOT_FOUND");
  }
}
