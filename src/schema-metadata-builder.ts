import { defineSchemaMetadata } from "./schema-metadata";
import type { AnyDatabase, AnyTable, TableName, TSchemaMetadata, TraceIdGenerator, Middleware } from "./types";

export class SchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends Record<string, any> = {},
> {
  private globalMiddlewares: Middleware[] = [];
  private isThrowError: boolean = false;
  private traceIdGenerator?: TraceIdGenerator;

  constructor(
    private db: TDb,
    private tables: TTables,
    private mode: "strict" | "lenient",
    private metadata: TMetadata = {} as TMetadata,
  ) {}

  use(middleware: Middleware): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  withThrowError(val: boolean): this {
    this.isThrowError = val;
    return this;
  }

  withTraceIdGenerator(gen: TraceIdGenerator): this {
    this.traceIdGenerator = gen;
    return this;
  }

  table<
    TName extends TableName<TTables[number]>,
    const TConfig extends TSchemaMetadata<TDb, TTables>[TName],
  >(tableName: TName, config: TConfig): SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }> {
    const metadataWithNewTable = {
      ...this.metadata,
      [tableName]: config,
    };
    const newBuilder = new SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }>(
      this.db,
      this.tables,
      this.mode,
      metadataWithNewTable as any,
    );
    newBuilder.globalMiddlewares = [...this.globalMiddlewares];
    newBuilder.isThrowError = this.isThrowError;
    newBuilder.traceIdGenerator = this.traceIdGenerator;
    return newBuilder;
  }

  build() {
    const finalMetadata = this.metadata as unknown as TMetadata;
    return defineSchemaMetadata(
      this.db,
      this.tables,
      this.mode,
      this.globalMiddlewares,
      this.isThrowError,
      this.traceIdGenerator
    )(finalMetadata);
  }
}

export function createSchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables, mode: "strict" | "lenient" = "lenient") {
  return new SchemaBuilder(db, tables, mode);
}
