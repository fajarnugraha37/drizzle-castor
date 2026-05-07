import { defineSchemaMetadata } from "./schema-metadata";
import type { AnyDatabase, AnyTable, TableName, TSchemaMetadata } from "./types";

export class SchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends TSchemaMetadata<TDb, TTables>,
> {
  constructor(
    private db: TDb,
    private tables: TTables,
    private mode: "strict" | "lenient",
    private metadata: TMetadata = {} as TMetadata,
  ) {}

  table<
    TName extends TableName<TTables[number]>,
    TConfig extends TSchemaMetadata<TDb, TTables>[TName],
  >(tableName: TName, config: TConfig) {
    const metadataWithNewTable = {
      ...this.metadata,
      [tableName]: config,
    };
    return new SchemaBuilder(
      this.db,
      this.tables,
      this.mode,
      metadataWithNewTable,
    );
  }

  build() {
    const finalMetadata = this.metadata as unknown as TSchemaMetadata<
      TDb,
      TTables
    >;
    return defineSchemaMetadata(this.db, this.tables, this.mode)(finalMetadata);
  }
}

export function createSchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables, mode: "strict" | "lenient" = "lenient") {
  return new SchemaBuilder(db, tables, mode);
}
