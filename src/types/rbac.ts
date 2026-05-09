import type { InferEntity, FindTable } from "./helper";
import type { FlattenPaths } from "./query";
import type { AnyDatabase, AnyTable } from "./schema-metadata";
import type { InferInsert, DbAction } from "./value";
import type { ExecutionContext } from "./context";
import type { BaseSchema } from "./base";

export type UnifiedPolicyConfig<
  TSchema extends {
    db: AnyDatabase;
    tables: readonly AnyTable[];
    metadata: any;
  },
  TTableName extends string,
  TEntityPaths = FlattenPaths<InferEntity<TSchema, TTableName, []>, "", 2>,
  TInsertKeys = keyof InferInsert<FindTable<TSchema["tables"], TTableName>> &
    string,
> = {
  allowedActions?: readonly DbAction[] | "*";
  allowedSets?:
    | readonly TInsertKeys[]
    | "*"
    | ((
        ctx: ExecutionContext,
      ) =>
        | Promise<readonly TInsertKeys[] | "*">
        | readonly TInsertKeys[]
        | "*");
  allowedProjections?:
    | readonly TEntityPaths[]
    | "*"
    | ((
        ctx: ExecutionContext,
      ) =>
        | Promise<readonly TEntityPaths[] | "*">
        | readonly TEntityPaths[]
        | "*");
  allowedFilters?:
    | readonly TEntityPaths[]
    | "*"
    | ((
        ctx: ExecutionContext,
      ) =>
        | Promise<readonly TEntityPaths[] | "*">
        | readonly TEntityPaths[]
        | "*");
  allowedSorts?:
    | readonly TEntityPaths[]
    | "*"
    | ((
        ctx: ExecutionContext,
      ) =>
        | Promise<readonly TEntityPaths[] | "*">
        | readonly TEntityPaths[]
        | "*");
};

export type PolicyDefinition<
  TSchema extends BaseSchema,
  TTableName extends string,
  TProfileNames extends string = string,
> =
  | Record<
      TProfileNames | "default",
      | UnifiedPolicyConfig<TSchema, TTableName>
      | ((
          ctx: ExecutionContext<TSchema["db"], TSchema["tables"]>,
        ) =>
          | Promise<UnifiedPolicyConfig<TSchema, TTableName>>
          | UnifiedPolicyConfig<TSchema, TTableName>)
    >
  | ((
      ctx: ExecutionContext<TSchema["db"], TSchema["tables"]>,
      activeProfiles: string[],
    ) =>
      | Promise<UnifiedPolicyConfig<TSchema, TTableName>>
      | UnifiedPolicyConfig<TSchema, TTableName>);

export type GlobalPolicyDefinition<
  TSchema extends BaseSchema,
  TProfileNames extends string = string,
> = (
  ctx: ExecutionContext<TSchema["db"], TSchema["tables"]>,
  tableName: string,
  activeProfiles: string[],
) =>
  | Promise<UnifiedPolicyConfig<TSchema, any>>
  | UnifiedPolicyConfig<TSchema, any>;
