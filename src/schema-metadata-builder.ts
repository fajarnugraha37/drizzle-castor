import { defineSchemaMetadata } from "./schema-metadata";
import type { AnyDatabase, AnyTable, TableName, TSchemaMetadata } from "./types";

export class SchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends Record<string, any> = {},
> {
  constructor(
    private db: TDb,
    private tables: TTables,
    private mode: "strict" | "lenient",
    private metadata: TMetadata = {} as TMetadata,
  ) {}

  table<
    TName extends TableName<TTables[number]>,
    const TConfig extends TSchemaMetadata<TDb, TTables>[TName],
  >(tableName: TName, config: TConfig): SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }> {
    const metadataWithNewTable = {
      ...this.metadata,
      [tableName]: config,
    };
    return new SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }>(
      this.db,
      this.tables,
      this.mode,
      metadataWithNewTable as any,
    );
  }

  build() {
    const finalMetadata = this.metadata as unknown as TMetadata;
    return defineSchemaMetadata(this.db, this.tables, this.mode)(finalMetadata);
  }
}

export function createSchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables, mode: "strict" | "lenient" = "lenient") {
  return new SchemaBuilder(db, tables, mode);
}
