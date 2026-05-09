import type { RecursiveDepth } from "./base";

/**
 * FindTable: Robustly finds a table in the schema's tables array by its name, using a discriminated union approach.
 * This ensures that we can reliably extract the correct table type even in complex schemas, while providing a clear error if the table is not found.
 */
export type FindTable<
  TTables extends readonly any[],
  TName extends string,
> = Extract<TTables[number], { _: { name: TName } }>;

/**
 * Robustly infers the select model from a Drizzle table.
 * Fallbacks to a generic record if the table structure is non-standard or missing markers,
 * preventing 'never' collapse in recursive entity chains.
 */
export type InferModel<TTable> = TTable extends { $inferSelect: infer U }
  ? U
  : TTable extends { _ : { columns: infer C } }
    ? { [K in keyof C]: any }
    : Record<string, any>;

/**
 * ExtractRelationsArray: Safely extracts an array of relation metadata from the table metadata for a given relation type (e.g., "oneToMany").
 * If the specified relation type is not present or not an array, it defaults to an empty array, ensuring type safety and preventing errors in subsequent processing.
 */
export type ExtractRelationsArray<
  TMeta,
  K extends string,
> = K extends keyof TMeta
  ? TMeta[K] extends readonly any[]
    ? TMeta[K]
    : []
  : [];

/**
 * GetTableMeta: Safely extracts metadata for a given table from the schema, with a fallback to an empty object if not found.
 * This prevents type errors in cases where metadata might be missing or incomplete, while still allowing for proper inference when it is present.
 */
export type GetTableMeta<
  TSchema extends { metadata: any },
  TTableName extends string,
> = TTableName extends keyof TSchema["metadata"]
  ? TSchema["metadata"][TTableName]
  : {};

/**
 * Infers a full entity type for a given table, including all nested relations up to a specified depth.
 * Uses a depth counter to prevent infinite recursion in cyclic schemas.
 * For each relation type (one-to-many, many-to-many, one-to-one, many-to-one), it recursively infers the related entity.
 * If the depth limit is reached, it falls back to just inferring the base model without further relations.
 */
export type InferEntity<
  TSchema extends { tables: readonly any[]; metadata: any },
  TTableName extends string,
  TDepth extends any[] = [],
> = TDepth["length"] extends RecursiveDepth
  ? InferModel<FindTable<TSchema["tables"], TTableName>> // Limit tercapai, stop rekursi relasi
  : InferModel<FindTable<TSchema["tables"], TTableName>> & {
      // Base Columns (id, name, dll)
      // Infer Array Relations (One-To-Many & Many-To-Many)
      [R in ExtractRelationsArray<
        GetTableMeta<TSchema, TTableName>,
        "oneToMany" | "manyToMany"
      >[number] as R["relationName"] & string]: Array<
        InferEntity<TSchema, R["relatedTable"], [...TDepth, any]>
      >;
    } & {
      // Infer Object Relations (One-To-One & Many-To-One)
      [R in ExtractRelationsArray<
        GetTableMeta<TSchema, TTableName>,
        "oneToOne" | "manyToOne"
      >[number] as R["relationName"] & string]: InferEntity<
        TSchema,
        R["relatedTable"],
        [...TDepth, any]
      >;
    };
