import { CastorError } from "./base";

export class MutationError extends CastorError {
  constructor(message: string, details?: any) {
    super(message, "MUTATION_ERROR", details);
  }
}