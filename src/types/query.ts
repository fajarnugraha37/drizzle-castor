export type Primitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | symbol
  | bigint;

/**
 * Optimized Check if a type is a traversable object (not a primitive)
 */
export type IsTraversable<T> = NonNullable<T> extends Primitive ? false : true;

/**
 * Depth Counter to prevent infinite recursion and maintain performance.
 * Supporting up to 10 levels.
 */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * OPTIMIZED PATH FLATTENING:
 * Uses tail-recursive pattern and simpler conditional logic to reduce compiler load.
 */
export type FlattenPaths<T, Prefix extends string = "", Depth extends number = 10> = 
  [Depth] extends [never] 
    ? never 
    : T extends object
      ? {
          [K in keyof T]-?: K extends string | number
            ? NonNullable<T[K]> extends ReadonlyArray<infer U>
              ? IsTraversable<U> extends true
                ? | `${Prefix}${K}`
                  | `${Prefix}${K}.${number}`
                  | FlattenPaths<NonNullable<U>, `${Prefix}${K}.`, Prev[Depth]>
                  | FlattenPaths<NonNullable<U>, `${Prefix}${K}.${number}.`, Prev[Depth]>
                : `${Prefix}${K}` | `${Prefix}${K}.${number}`
              : IsTraversable<T[K]> extends true
                ? | `${Prefix}${K}`
                  | FlattenPaths<NonNullable<T[K]>, `${Prefix}${K}.`, Prev[Depth]>
                : `${Prefix}${K}`
            : never;
        }[keyof T]
      : never;

export type Field<T> = FlattenPaths<T>;
export type FieldValue<T, P extends Field<T>> = ValueAt<T, P>;

/**
 * Optimized ValueAt using faster string parsing.
 */
export type ValueAt<T, P extends string> = 
  P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? NonNullable<T[K]> extends ReadonlyArray<infer U>
        ? R extends `${number}.${infer Rest}`
          ? ValueAt<NonNullable<U>, Rest>
          : R extends `${number}`
            ? U
            : ValueAt<NonNullable<U>, R>
        : NonNullable<T[K]> extends object
          ? ValueAt<NonNullable<T[K]>, R>
          : never
      : K extends `${number}`
        ? T extends ReadonlyArray<infer U>
          ? ValueAt<U, R>
          : never
        : never
    : P extends keyof T
      ? T[P]
      : P extends `${number}`
        ? T extends ReadonlyArray<infer U> ? U : never
        : never;

/**
 * Extract the "leaf" type from a field (unwrap array to get element type)
 */
export type LeafType<T> =
  NonNullable<T> extends ReadonlyArray<infer U>
    ? NonNullable<U>
    : NonNullable<T>;

/**
 * OPERATORS DEFINITION
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

export type FilterQuery<T> = Partial<Conjunctions<T>> & {
  [K in FlattenPaths<T>]?: FieldOperators<ValueAt<T, K>>;
};

export type OrderDirection = "asc" | "desc";
export type NullsPosition = "first" | "last";

export type OrderFieldConfig =
  | OrderDirection
  | {
      direction?: OrderDirection;
      nulls?: NullsPosition;
      aggregate?: "min" | "max" | "avg" | "sum" | "count";
    };

export type OrderQuery<T> = {
  [K in FlattenPaths<T>]?: OrderFieldConfig;
};

export type OrderClause<T> = {
  path: FlattenPaths<T>;
  direction?: OrderDirection;
  nulls?: NullsPosition;
};
export type OrderQueryArray<T> = OrderClause<T> | OrderClause<T>[];

/**
 * Optimized DeepPick using more efficient mapping.
 */
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
  projection?: FlattenPaths<T>[];
  filter?: FilterQuery<T>;
  order?: OrderQuery<T>;
  page?: number;
  pageSize?: number;
};

export type UpdateSet<T> = {
  [K in FlattenPaths<T>]?: ValueAt<T, K>;
};

export type UpdateQuery<T, U> = {
  set: UpdateSet<T>;
  filter: FilterQuery<U>;
};

export type DeleteQuery<T> = {
  filter: FilterQuery<T>;
};
