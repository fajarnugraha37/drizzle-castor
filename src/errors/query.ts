import { CastorError } from "./base";
import type { ErrorCode } from "./codes";

export class QueryParsingError extends CastorError {
  constructor(message: string, code: ErrorCode = "QUERY_PARSING_ERROR", details?: any) {
    super(message, code, details);
  }
}

export class TableNotFoundError extends QueryParsingError {
  constructor(message: string, details?: any) {
    super(message, "TABLE_NOT_FOUND", details);
  }
}

export class ColumnNotFoundError extends QueryParsingError {
  constructor(message: string, details?: any) {
    super(message, "COLUMN_NOT_FOUND", details);
  }
}

export class RelationNotFoundError extends QueryParsingError {
  constructor(message: string, details?: any) {
    super(message, "RELATION_NOT_FOUND", details);
  }
}

export class AliasNotFoundError extends QueryParsingError {
  constructor(message: string, details?: any) {
    super(message, "ALIAS_NOT_FOUND", details);
  }
}