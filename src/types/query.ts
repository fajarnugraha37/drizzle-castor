export {};

declare global {
  export type Primitive =
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | symbol
    | bigint;

  export type ArrayElement<T> = T extends ReadonlyArray<infer U> ? U : never;

  export type IsObject<T> = NonNullable<T> extends Primitive
    ? false
    : NonNullable<T> extends ReadonlyArray<infer U>
      ? NonNullable<U> extends Primitive
        ? false
        : true
      : NonNullable<T> extends object
        ? true
        : false;

  /**
   * PATH FLATTENING:
   * Flatten nested object paths with dot notation
   * Handles arrays: if array contains objects, traverse into them; otherwise treat as leaf
   */
  export type FlattenPaths<T, Prefix extends string = ""> = {
    [K in keyof T]-?: NonNullable<T[K]> extends ReadonlyArray<infer U>
      ? IsObject<U> extends true
        ? `${Prefix}${K & string}` | FlattenPaths<NonNullable<U>, `${Prefix}${K & string}.`>
        : `${Prefix}${K & string}`
      : IsObject<T[K]> extends true
        ?
            | `${Prefix}${K & string}`
            | FlattenPaths<NonNullable<T[K]>, `${Prefix}${K & string}.`>
        : `${Prefix}${K & string}`;
  }[keyof T];
  export type Field<T> = FlattenPaths<T>;
  export type FieldValue<T, P extends Field<T>> = ValueAt<T, P>;

  /**
   * Get the value type at a given flattened path
   */
  export type ValueAt<T, P extends string> = P extends `${infer K}.${infer R}`
    ? K extends keyof T
      ? T[K] extends ReadonlyArray<infer U>
        ? IsObject<U> extends true
          ? ValueAt<U, R>
          : never
        : IsObject<T[K]> extends true
          ? ValueAt<T[K], R>
          : never
      : never
    : P extends keyof T
      ? T[P]
      : never;

  /**
   * Extract the "leaf" type from a field (unwrap array to get element type)
   */
  export type LeafType<T> = NonNullable<T> extends ReadonlyArray<infer U> ? NonNullable<U> : NonNullable<T>;

  /**
   * OPERATORS DEFINITION
   */
  export type ComparisonOps<T> = {
    $eq?: T;
    $ne?: T;
  };

  export type OrderableOps<T> = NonNullable<T> extends string | number | Date
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

  export type BetweenOps<T> = NonNullable<T> extends string | number | Date
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

  /**
   * Combine all operators for a given field type
   * Type safety: operators only available when field type matches
   */
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
   * Recursive FilterQuery type that supports:
   * - Flattened field paths with type-safe operators
   * - Logical conjunctions ($and, $or, $not)
   * - Mixing conjunctions with field conditions in same object
   */
  export type FilterQuery<T> = Partial<Conjunctions<T>> & {
    [K in FlattenPaths<T>]?: FieldOperators<ValueAt<T, K>>;
  };

  /**
   * BASE ORDER TYPES
   */
  export type OrderDirection = "asc" | "desc";
  export type NullsPosition = "first" | "last";

  /**
   * Order configuration untuk satu field
   * Bisa string shorthand atau object dengan opsi lengkap
   */
  export type OrderFieldConfig =
    | OrderDirection // shorthand: 'asc' | 'desc'
    | {
        direction?: OrderDirection; // default: 'asc'
        nulls?: NullsPosition; // optional: 'first' | 'last'
        aggregate?: "min" | "max" | "avg" | "sum" | "count"; // optional: for array relations
      };

  /**
   * MAIN ORDER QUERY TYPE:
   * OrderQuery<T> - Type-safe ordering dengan support:
   * - Flattened field paths (dot notation)
   * - Direction: 'asc' | 'desc' (default: 'asc')
   * - Null positioning: 'first' | 'last' (optional)
   *
   * Usage patterns:
   * 1. Simple: { name: 'asc' }
   * 2. With nulls: { name: { direction: 'desc', nulls: 'first' } }
   * 3. Multiple fields: { age: 'desc', name: { nulls: 'last' } }
   */
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
   * Deeply pick properties from an object based on a union of dot-notation string paths.
   */
  export type DeepPick<T, P extends string> = T extends ReadonlyArray<infer U>
    ? DeepPick<U, P>[]
    : {
        [K in keyof T as Extract<P, `${K & string}` | `${K & string}.${string}`> extends never
          ? never
          : K]: Extract<P, `${K & string}`> extends never
          ? DeepPick<
              NonNullable<T[K]>,
              Extract<P, `${K & string}.${string}`> extends `${K & string}.${infer Rest}`
                ? Rest
                : never
            > | Extract<T[K], null | undefined>
          : T[K]; // If exact base key is matched, return the whole object
      };

  export type SearchQuery<T> = {
    projection?: FlattenPaths<T>[];
    filter?: FilterQuery<T>;
    order?: OrderQuery<T>;
    page?: number;
    pageSize?: number;
  };

  export type UpdateQuery<T, U> = {
    set: Partial<T>;
    filter: FilterQuery<U>;
  };

  export type DeleteQuery<T> = {
    filter: FilterQuery<T>;
  };
}
