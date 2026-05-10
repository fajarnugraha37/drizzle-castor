import mitt from "mitt";
import { defineSchemaMetadata } from "./schema-metadata";
import type { AnyDatabase, AnyTable, TableName, TSchemaMetadata, TraceIdGenerator, Middleware, MiddlewareConfig, PolicyDefinition, TSchemaContext, GlobalPolicyDefinition, CastorEvents, LoggerConfig, CastorInstance, TransactionOptions } from "./types";
import { logger } from "./helper/logger-helper";

export class SchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends Record<string, any> = {},
  TProfiles extends readonly string[] = ["default"],
> {
  private registeredMiddlewares: { middleware: Middleware, config?: MiddlewareConfig<TTables> }[] = [];
  private registeredProfiles: string[] = ["default"];
  private registeredPolicies: Map<string, PolicyDefinition<any, any, any>> = new Map();
  private globalPolicy?: GlobalPolicyDefinition<any, any>;
  private loggerConfig: LoggerConfig = { level: "WARN" };
  private transactionOptions: TransactionOptions = {
    propagation: "REQUIRED",
    isolationLevel: "read committed",
  };
  private isThrowError: boolean = false;
  private traceIdGenerator?: TraceIdGenerator;
  private emitter = mitt<CastorEvents>();

  constructor(
    private db: TDb,
    private tables: TTables,
    private mode: "strict" | "lenient",
    private metadata: TMetadata = {} as TMetadata,
  ) {}

  profiles<const P extends readonly string[]>(profiles: P): SchemaBuilder<TDb, TTables, TMetadata, P> {
    const newBuilder = new SchemaBuilder<TDb, TTables, TMetadata, P>(
      this.db,
      this.tables,
      this.mode,
      this.metadata as any
    );
    newBuilder.registeredMiddlewares = [...this.registeredMiddlewares];
    newBuilder.registeredProfiles = [...profiles];
    newBuilder.registeredPolicies = new Map(this.registeredPolicies);
    newBuilder.globalPolicy = this.globalPolicy;
    newBuilder.loggerConfig = this.loggerConfig;
    newBuilder.transactionOptions = { ...this.transactionOptions };
    newBuilder.isThrowError = this.isThrowError;
    newBuilder.traceIdGenerator = this.traceIdGenerator;
    newBuilder.emitter = this.emitter;
    return newBuilder;
  }

  on<K extends keyof CastorEvents>(type: K, handler: (event: CastorEvents[K]) => void): this {
    this.emitter.on(type, handler);
    return this;
  }

  off<K extends keyof CastorEvents>(type: K, handler: (event: CastorEvents[K]) => void): this {
    this.emitter.off(type, handler);
    return this;
  }


  policies(policy: GlobalPolicyDefinition<TSchemaContext<TDb, TTables, TMetadata>, TProfiles[number]>): this;
  policies<TName extends TableName<TTables[number]>>(
    tableName: TName,
    policy: PolicyDefinition<TSchemaContext<TDb, TTables, TMetadata>, TName, TProfiles[number]>
  ): this;
  policies<TName extends TableName<TTables[number]>>(
    arg1: TName | GlobalPolicyDefinition<TSchemaContext<TDb, TTables, TMetadata>, TProfiles[number]>,
    arg2?: PolicyDefinition<TSchemaContext<TDb, TTables, TMetadata>, TName, TProfiles[number]>
  ): this {
    if (typeof arg1 === "function") {
      this.globalPolicy = arg1 as any;
    } else {
      this.registeredPolicies.set(arg1 as string, arg2 as any);
    }
    return this;
  }

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
  >(tableName: TName, config: TConfig): SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }, TProfiles> {
    logger.debug(`Registering table metadata for '${tableName as string}'`);
    const metadataWithNewTable = {
      ...this.metadata,
      [tableName]: config,
    };
    const newBuilder = new SchemaBuilder<TDb, TTables, TMetadata & { [K in TName]: TConfig }, TProfiles>(
      this.db,
      this.tables,
      this.mode,
      metadataWithNewTable as any,
    );
    newBuilder.registeredMiddlewares = [...this.registeredMiddlewares];
    newBuilder.registeredProfiles = [...this.registeredProfiles];
    newBuilder.registeredPolicies = new Map(this.registeredPolicies);
    newBuilder.globalPolicy = this.globalPolicy;
    newBuilder.loggerConfig = this.loggerConfig;
    newBuilder.transactionOptions = { ...this.transactionOptions };
    newBuilder.isThrowError = this.isThrowError;
    newBuilder.traceIdGenerator = this.traceIdGenerator;
    newBuilder.emitter = this.emitter;
    return newBuilder;
  }

  withLogger(config: LoggerConfig): this {
    this.loggerConfig = config;
    logger.debug(`Logger configured with level: ${config.level || "WARN"}`);
    return this;
  }

  withTransaction(options: TransactionOptions): this {
    this.transactionOptions = { ...this.transactionOptions, ...options };
    logger.debug(`Default transaction options configured: ${JSON.stringify(this.transactionOptions)}`);
    return this;
  }

  build(): CastorInstance<TDb, TTables, TMetadata> {
    logger.info(`Building SchemaMetadata for ${Object.keys(this.metadata).length} tables`);
    const finalMetadata = this.metadata as unknown as TMetadata;
    return defineSchemaMetadata(
      this.db,
      this.tables,
      this.mode,
      this.registeredMiddlewares,
      this.registeredPolicies,
      this.globalPolicy,
      this.emitter,
      this.loggerConfig,
      this.isThrowError,
      this.traceIdGenerator,
      this.transactionOptions
    )(finalMetadata);
  }
}

export function createSchemaBuilder<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables, mode: "strict" | "lenient" = "lenient"): SchemaBuilder<TDb, TTables> {
  return new SchemaBuilder(db, tables, mode);
}
