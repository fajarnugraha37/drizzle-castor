import { CastorError } from "./base";

export class ConfigurationError extends CastorError {
  constructor(message: string, details?: any) {
    super(message, "CONFIGURATION_ERROR", details);
  }
}