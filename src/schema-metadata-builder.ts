import { defineSchemaMetadata } from "./schema-metadata";
import type { AnyDatabase, AnyTable, TableName, TSchemaMetadata, TraceIdGenerator, Middleware, MiddlewareConfig } from "./types";

export class SchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends Record<string, any> = {},
> {
  private registeredMiddlewares: { middleware: Middleware, config?: MiddlewareConfig<TTables> }[] = [];
  private isThrowError: boolean = false;
  private traceIdGenerator?: TraceIdGenerator;

  constructor(
    private db: TDb,
    private tables: TTables,
    private mode: "strict" | "lenient",
    private metadata: TMetadata = {} as TMetadata,
  ) {}

  use(middleware: Middleware, config?: MiddlewareConfig<TTables>): this {
    this.registeredMiddlewares.push({ middleware, config });
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
    newBuilder.registeredMiddlewares = [...this.registeredMiddlewares];
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
      this.registeredMiddlewares,
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
