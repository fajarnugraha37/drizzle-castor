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

export type FlattenPaths<T, Prefix extends string = "", Depth extends number = 5> = 
  [Depth] extends [never] 
    ? never 
    : T extends object
      ? {
          [K in keyof T]-?: K extends string | number
            ? NonNullable<T[K]> extends ReadonlyArray<infer U>
              ? IsTraversable<U> extends true
                ? | `${Prefix}${K}`
                  | FlattenPaths<NonNullable<U>, `${Prefix}${K}.`, Prev[Depth]>
                : `${Prefix}${K}`
              : IsTraversable<T[K]> extends true
                ? | `${Prefix}${K}`
                  | FlattenPaths<NonNullable<T[K]>, `${Prefix}${K}.`, Prev[Depth]>
                : `${Prefix}${K}`
            : never;
        }[keyof T]
      : never;

export type Field<T> = FlattenPaths<T>;
export type FieldValue<T, P extends Field<T>> = ValueAt<T, P>;

export type ValueAt<T, P extends string> = 
  P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? NonNullable<T[K]> extends ReadonlyArray<infer U>
        ? ValueAt<NonNullable<U>, R>
        : NonNullable<T[K]> extends object
          ? ValueAt<NonNullable<T[K]>, R>
          : never
      : never
    : P extends keyof T
      ? T[P]
      : never;

export type LeafType<T> =
  NonNullable<T> extends ReadonlyArray<infer U>
    ? NonNullable<U>
    : NonNullable<T>;

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

// --- FACTORY HELPERS ---

export function defineFilter<T>(filter: FilterQuery<T>): FilterQuery<T> {
  return filter;
}

export function defineSearchQuery<T>(query: SearchQuery<T>): SearchQuery<T> {
  return query;
}

export function defineUpdateSet<T>(set: UpdateSet<T>): UpdateSet<T> {
  return set;
}

export function defineProjection<T>(p: FlattenPaths<T>[]): FlattenPaths<T>[] {
  return p;
}
