import { CastorError } from "./base";

export class SecurityError extends CastorError {
  constructor(message: string, details?: any) {
    super(message, "SECURITY_ERROR", details);
  }
}

export class AccessDeniedError extends CastorError {
  constructor(message: string, details?: any) {
    super(message, "ACCESS_DENIED", details);
  }
}