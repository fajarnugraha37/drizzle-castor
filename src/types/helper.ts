import type { RecursiveDepth } from "./base";

// Mencari instance tabel Drizzle berdasarkan string nama tabelnya di DB
export type FindTable<
  TTables extends readonly any[],
  TName extends string,
> = Extract<TTables[number], { _: { name: TName } }>;

// Mengambil base type hasil query SELECT dari tabel Drizzle
export type InferModel<TTable> = TTable extends { $inferSelect: infer U }
  ? U
  : never;

// Mengambil array relasi secara aman dari metadata
export type ExtractRelationsArray<
  TMeta,
  K extends string,
> = K extends keyof TMeta
  ? TMeta[K] extends readonly any[]
    ? TMeta[K]
    : []
  : [];

// Mendapatkan konfigurasi relasi dari suatu tabel
export type GetTableMeta<
  TSchema extends { metadata: any },
  TTableName extends string,
> = TTableName extends keyof TSchema["metadata"]
  ? TSchema["metadata"][TTableName]
  : {};

// THE RECURSIVE ENTITY BUILDER ---
// Merakit Base Table + Relasinya secara otomatis!
// TDepth membatasi rekursi hingga kedalaman ke-5 agar TS compiler tidak meledak.
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
