// Ekstrak tipe data INSERT (tanpa relasi, murni kolom database)
export type InferInsert<TTable> = TTable extends { $inferInsert: infer U }
  ? U
  : never;

// Literal Actions untuk Permission Profiles
export type DbAction =
  | "create"
  | "read"
  | "update"
  | "softDelete"
  | "restore"
  | "hardDelete";

// Tipe Soft Delete Provider (Mendukung static, function sync, maupun async)
export type ValueProvider<T> = T | (() => T) | (() => Promise<T>);

export type SoftDeleteConfig<TBaseTable> = {
  deleteValue: Partial<{
    [K in keyof TBaseTable]: ValueProvider<TBaseTable[K]>;
  }>;
  restoreValue: Partial<{
    [K in keyof TBaseTable]: ValueProvider<TBaseTable[K]>;
  }>;
};

/**
 * CENTRALIZED RESERVED KEYWORDS (OPERATORS)
 */
export const CONJUNCTION_OPERATORS = ["$and", "$or", "$not"] as const;

export const FIELD_OPERATORS = [
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$isNull",
  "$notIsNull",
  "$in",
  "$notIn",
  "$inArray",
  "$notInArray",
  "$between",
  "$notBetween",
  "$like",
  "$ilike",
  "$notLike",
  "$notIlike",
  "$arrayContains",
  "$arrayContained",
  "$arrayOverlaps",
] as const;

export const ALL_OPERATORS = [
  ...CONJUNCTION_OPERATORS,
  ...FIELD_OPERATORS,
] as const;

export type ConjunctionOperator = (typeof CONJUNCTION_OPERATORS)[number];
export type FieldOperator = (typeof FIELD_OPERATORS)[number];
export type ReservedOperator = (typeof ALL_OPERATORS)[number];
