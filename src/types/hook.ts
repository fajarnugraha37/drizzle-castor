import type { InferModel, FindTable } from "./helper";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { SoftDeleteConfig, DbAction } from "./value";

export type TableConfig<
  TSchema extends {
    db: AnyDatabase;
    tables: readonly AnyTable[];
    metadata: any;
  },
  TTableName extends string,
> = {
  softDelete?: SoftDeleteConfig<
    InferModel<FindTable<TSchema["tables"], TTableName>>
  >;
  profiles?: Record<string, readonly DbAction[]>;
};
