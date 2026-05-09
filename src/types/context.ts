import type { SearchQuery, FilterQuery, UpdateSet } from "./query";
import type { DbAction, AnyDatabase, AnyTable, TSchemaMetadata, TTranslatorContext } from "./index";

export type ExecutionContextParams<TEntity = any> = {
  query?: SearchQuery<TEntity>;
  data?: any | any[];
  id?: string | number;
  filter?: FilterQuery<TEntity>;
  set?: UpdateSet<TEntity>;
};

export interface ExecutionContext<
  TDb extends AnyDatabase = AnyDatabase,
  TTables extends readonly AnyTable[] = any,
  TMetadata extends Record<string, any> = Record<string, any>,
  TState extends Record<string, any> = Record<string, any>,
> {
  /** Unique ID for the entire trace (shared across nested calls) */
  traceId: string;
  /** Unique ID for the current execution unit (span) */
  spanId: string;
  /** ID of the parent span for nested calls */
  parentId?: string;
  /** High-resolution timestamp for performance tracking */
  startTime: number;
  /** End timestamp (set when finished) */
  endTime?: number;
  /** Total execution time in ms */
  duration?: number;
  /** Current status of the execution unit */
  status?: "running" | "success" | "failed";
  /** Error information if status is 'failed' */
  error?: any;
  /** The CRUD action being performed */
  action: DbAction;
  /** The target table name */
  tableName: string;
  /** The active RBAC profile(s) */
  profile?: string | string[];
  /** A snapshot of the initial parameters (query/data/filter/set) */
  params: ExecutionContextParams;
  /** User-provided contextual data (e.g., userId, sessionId) */
  metadata: TMetadata;
  /** Internal state bag for middleware communication */
  state: TState;
  /** Schema metadata and database instances */
  translatorContext: TTranslatorContext<TDb, TTables>;
}

/**
 * Type for telemetry listeners that want to process completed execution contexts.
 */
export type TelemetrySubscriber = (ctx: ExecutionContext<any, any, any, any>) => void | Promise<void>;

export type TranslatorContext<
  TDb extends AnyDatabase = AnyDatabase,
  TTables extends readonly AnyTable[] = any,
  TMetadata extends TSchemaMetadata<TDb, TTables> = any
> = {
  db: TDb;
  tables: readonly AnyTable[];
  metadata: TMetadata;
  baseTableName: string;
};