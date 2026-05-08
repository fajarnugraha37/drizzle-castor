import { ConfigurationError } from "../errors";
import type { SoftDeleteConfig } from "../types";

export function getSoftDeleteConfig(
  metadata: any,
  tableName: string,
): SoftDeleteConfig<any> {
  const config = metadata[tableName]?.softDelete;
  if (!config) {
    throw new ConfigurationError(
      `Soft delete is not configured for table '${tableName}'`,
    );
  }
  return config;
}
