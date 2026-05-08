export type Primitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | symbol
  | bigint;

export type IsTraversable<T> = NonNullable<T> extends Primitive ? false : true;

type Prev = [never, 0, 1, 2, 3, 4, 5];

/**
 * OPTIMIZED FLATTEN PATHS (Autocomplete Focus):
 * Only generates object property paths. 
 * Numeric indices are handled via Template Literal validation to prevent IDE lag.
 */
export type FlattenPaths<T, Prefix extends string = "", Depth extends number = 5> = 
  [Depth] extends [never] 
    ? never 
    : T extends object
      ? {
          [K in keyof T]-?: K extends string | number
            ? IsTraversable<T[K]> extends true
                ? | `${Prefix}${K}`
                  | FlattenPaths<LeafType<T[K]>, `${Prefix}${K}.`, Prev[Depth]>
                : `${Prefix}${K}`
            : never;
        }[keyof T]
      : never;

/**
 * DYNAMIC PATH VALIDATOR:
 * Allows the base FlattenPaths PLUS any numeric indexing patterns.
 */
export type ValidPath<T> = FlattenPaths<T> | `${FlattenPaths<T>}.${number}` | `${FlattenPaths<T>}.${number}.${string}`;

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
        ? T extends ReadonlyArray<infer U>
          ? ValueAt<U, R>
          : never
        : never
    : P extends `${number}`
      ? T extends ReadonlyArray<infer U> ? U : never
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

export type OrderFieldConfig =
  | OrderDirection
  | {
      direction?: OrderDirection;
      nulls?: NullsPosition;
      aggregate?: "min" | "max" | "avg" | "sum" | "count";
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

// --- FACTORY HELPERS ---

export function defineFilter<T>(filter: FilterQuery<T>): FilterQuery<T> {
  return filter;
}

export function defineQuery<T>(query: SearchQuery<T>): SearchQuery<T> {
  return query;
}

export function defineUpdateSet<T>(set: UpdateSet<T>): UpdateSet<T> {
  return set;
}

export function defineProjection<T>(p: ValidPath<T>[]): ValidPath<T>[] {
  return p;
}

export function defineInsertValue<T>(data: T): T {
  return data;
}
