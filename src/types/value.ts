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
