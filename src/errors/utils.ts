import { CastorError } from "./base";
import { AccessDeniedError, SecurityError } from "./security";
import { QueryParsingError } from "./query";

/**
 * Checks if an error is an instance of CastorError
 */
export function isCastorError(error: any): error is CastorError {
  return error instanceof CastorError || Boolean(error && typeof error === "object" && typeof error.code === "string" && error.name?.endsWith("Error"));
}

/**
 * Checks if an error is related to security (AccessDenied or Security validation)
 */
export function isSecurityError(error: any): error is SecurityError | AccessDeniedError {
  return isCastorError(error) && (error.code === "SECURITY_ERROR" || error.code === "ACCESS_DENIED");
}

/**
 * Checks if an error is related to query parsing (TableNotFound, ColumnNotFound, etc.)
 */
export function isQueryError(error: any): error is QueryParsingError {
  return isCastorError(error) && [
    "QUERY_PARSING_ERROR",
    "TABLE_NOT_FOUND",
    "COLUMN_NOT_FOUND",
    "RELATION_NOT_FOUND",
    "ALIAS_NOT_FOUND"
  ].includes(error.code);
}

/**
 * Safely extracts the error message from an unknown error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}
