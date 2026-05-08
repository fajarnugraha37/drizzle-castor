import type { ErrorCode } from "./codes";

export class CastorError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;

  constructor(message: string, code: ErrorCode, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}