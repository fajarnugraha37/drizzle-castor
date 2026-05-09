import type { RecursiveDepth } from "./base";

export type Primitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | symbol
  | bigint;

export type RelationType =
  | "oneToMany"
  | "manyToMany"
  | "oneToOne"
  | "manyToOne";

export type RelationNode = {
  relationName: string;
  relatedTable: string;
  type: RelationType;
  isArray: boolean;
  foreignKey?: string;
  localKey?: string;
  joinTable?: string;
  joinLocalKey?: string;
  relatedKey?: string;
  joinRelatedKey?: string;
};

export type PathResolution = {
  nodes: RelationNode[];
  jsonPath?: string;
  relationPath: string; // The joined relation path
};

export type IsTraversable<T> = NonNullable<T> extends Primitive ? false : true;

type Prev = [never, 0, 1, 2, 3, 4, 5];

/**
 * OPTIMIZED FLATTEN PATHS (Autocomplete Focus):
 * Robustly generates paths for both objects and arrays.
 * Handles numeric indices natively to ensure deep type safety.
 */
export type FlattenPaths<T, Prefix extends string = "", Depth extends number = RecursiveDepth> = 
  [Depth] extends [never] 
    ? never 
    : NonNullable<T> extends ReadonlyArray<infer U>
      ? | `${Prefix}${number}`
        | FlattenPaths<U, `${Prefix}${number}.`, Prev[Depth]>
      : T extends object
        ? {
            [K in keyof T]-?: K extends string | number
              ? IsTraversable<T[K]> extends true
                  ? | `${Prefix}${K}`
                    | FlattenPaths<NonNullable<T[K]>, `${Prefix}${K}.`, Prev[Depth]>
                  : `${Prefix}${K}`
              : never;
          }[keyof T]
        : never;

/**
 * DYNAMIC PATH VALIDATOR:
 * Uses the recursive FlattenPaths to provide full type safety and autocomplete.
 */
export type ValidPath<T> = FlattenPaths<T>;

/**
 * OPTIMIZED VALUE LOOKUP:
 * Robustly handles dots and numbers in the path string.
 */
export type ValueAt<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? ValueAt<LeafType<T[K]>, R>
      : K extends `${number}`
        ? ValueAt<T, R>
        : never
    : P extends `${number}`
      ? T
      : never;

export type LeafType<T> =
  NonNullable<T> extends ReadonlyArray<infer U>
    ? NonNullable<U>
    : NonNullable<T>;

/**
 * OPERATORS
 */
export type ComparisonOps<T> = {
  $eq?: T;
  $ne?: T;
};

export type OrderableOps<T> =
  NonNullable<T> extends string | number | Date
    ? { $gt?: T; $gte?: T; $lt?: T; $lte?: T }
    : {};

export type NullOps = {
  $isNull?: boolean;
  $notIsNull?: boolean;
};

export type InOps<T> = {
  $in?: ReadonlyArray<T>;
  $notIn?: ReadonlyArray<T>;
  $inArray?: ReadonlyArray<T>;
  $notInArray?: ReadonlyArray<T>;
};

export type BetweenOps<T> =
  NonNullable<T> extends string | number | Date
    ? { $between?: readonly [T, T]; $notBetween?: readonly [T, T] }
    : {};

export type StringOps = {
  $like?: string;
  $ilike?: string;
  $notLike?: string;
  $notIlike?: string;
};

export type ArrayContainmentOps<T> =
  NonNullable<T> extends ReadonlyArray<infer U>
    ? {
        $arrayContains?: ReadonlyArray<U>;
        $arrayContained?: ReadonlyArray<U>;
        $arrayOverlaps?: ReadonlyArray<U>;
      }
    : {};

export type FieldOperators<T> = ComparisonOps<T> &
  OrderableOps<T> &
  NullOps &
  InOps<LeafType<T>> &
  BetweenOps<T> &
  ([NonNullable<T>] extends [string] ? StringOps : {}) &
  ArrayContainmentOps<T>;

export type Conjunctions<T> = {
  $not?: FilterQuery<T>;
  $and?: FilterQuery<T>[];
  $or?: FilterQuery<T>[];
};

/**
 * FilterQuery using ValidPath (Lazy Validation) to keep performance fast.
 */
export type FilterQuery<T> = Partial<Conjunctions<T>> & {
  [K in ValidPath<T>]?: FieldOperators<ValueAt<T, K>>;
};

export type OrderDirection = "asc" | "desc";
export type NullsPosition = "first" | "last";

/**
 * Supported aggregation functions. 
 * Whitelisted at the AST level in ast-compiler.ts.
 */
export type AggregateFunction = "min" | "max" | "avg" | "sum" | "count" | (string & {});;

export type OrderFieldConfig =
  | OrderDirection
  | {
      direction?: OrderDirection;
      nulls?: NullsPosition;
      aggregate?: AggregateFunction;
    };

export type OrderQuery<T> = {
  [K in ValidPath<T>]?: OrderFieldConfig;
};

export type DeepPick<T, P extends string> =
  T extends ReadonlyArray<infer U>
    ? DeepPick<U, P>[]
    : {
        [K in keyof T as Extract<
          P,
          `${K & string}` | `${K & string}.${string}`
        > extends never
          ? never
          : K]: Extract<P, `${K & string}`> extends never
          ?
              | DeepPick<
                  NonNullable<T[K]>,
                  Extract<
                    P,
                    `${K & string}.${string}`
                  > extends `${K & string}.${infer Rest}`
                    ? Rest
                    : never
                >
              | Extract<T[K], null | undefined>
          : T[K];
      };

export type SearchQuery<T> = {
  projection?: ValidPath<T>[];
  filter?: FilterQuery<T>;
  order?: OrderQuery<T>;
  page?: number;
  pageSize?: number;
};

export type UpdateSet<T> = {
  [K in ValidPath<T>]?: ValueAt<T, K>;
};

export type UpdateQuery<T, U> = {
  set: UpdateSet<T>;
  filter: FilterQuery<U>;
};

export type DeleteQuery<T> = {
  filter: FilterQuery<T>;
};

export type QueryPaths = {
  ctePaths: Set<string>;
  outerPaths: Set<string>;
  needsGroupBy: boolean;
};