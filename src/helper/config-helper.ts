import { ConfigurationError } from "../errors";
import type { AnyDatabase, AnyTable, TTranslatorContext } from "../types";
import type { SoftDeleteConfig, TableConfig } from "../types";

export function getTableMetadataConfig<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[]
>(
  translatorContext: TTranslatorContext<TDb, TTables>,
  tableName: string,
): TableConfig<any, any> | undefined {
  return (translatorContext.metadata as any)?.[tableName];
}

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
