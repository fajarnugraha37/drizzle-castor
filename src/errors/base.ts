import type { CastorErrorCode } from "../types";

export class CastorError extends Error {
  public readonly code: CastorErrorCode;
  public readonly details?: any;
  /** Internal marker to safely identify CastorError across different versions/environments */
  public readonly __isCastorError = true;

  constructor(message: string, code: CastorErrorCode, details?: any) {
    super(message);
    
    // Explicitly set the prototype for correct instanceof behavior in ES5 environments
    Object.setPrototypeOf(this, new.target.prototype);
    
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
