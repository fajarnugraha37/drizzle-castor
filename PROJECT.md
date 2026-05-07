# Project Context

## Overview

Project ini adalah Enterprise-Level Repository Builder & Headless CMS Engine yang dibangun di atas Drizzle ORM. Tujuan utamanya adalah menjembatani tabel relasional datar (flat) milik Drizzle menjadi *Nested Entity Objects* yang mendukung query ala MongoDB/Prisma (menggunakan flattened dot-notation) dengan keamanan tipe (Type-Safety) yang ekstrem dan inferensi otomatis 100%.

## Core Philosophy & Rules for AI Agents
Jika kamu adalah AI Agent yang sedang membantu mengembangkan codebase ini, patuhi aturan mutlak berikut:
1. Zero `any` Tolerance in Inference: Seluruh tipe metadata, relasi, dan query harus di-infer secara statis dari definisi *Drizzle Schema*. Jangan pernah menggunakan tipe `any` atau mem-bypass type-checker pada level interface publik.
2. Strict Literal Typings: Pertahankan pola *Curried Function Builder* (`defineSchemaMetadata`) dan penggunaan `as const` / `readonly` arrays. Ini krusial untuk mencegah *Type Widening* (misal: string literal `"userToBooks"` tidak boleh melebar menjadi `string` biasa).
3. Single Source of Truth: Definisi tabel Drizzle adalah satu-satunya *source of truth*. Jika kolom Drizzle diubah, seluruh parameter query (projection, filter, sort) di seluruh aplikasi harus otomatis menyesuaikan tanpa perlu mengubah interface secara manual.
4. Relational Dot-Notation: Sistem harus mengizinkan *deep-querying* hingga kedalaman tertentu (maksimal depth 3) menggunakan *dot-notation* (contoh: `'userToBooks.author'`) yang divalidasi ketat oleh TypeScript compiler.

## Architecture Architecture

Arsitektur terdiri dari 4 lapisan utama:

### 1. The Query Engine (`Query Types`)
Menyediakan interface pencarian bergaya NoSQL yang memipihkan (flatten) struktur objek TypeScript menggunakan *Dot-Notation*.
- `FlattenPaths<T>`: Engine rekursif yang mengubah object nested menjadi union string (e.g., `"id" | "name" | "profile.bio"`).
- `FilterQuery<T>`: Mendukung operator spesifik tipe data (`$eq`, `$gt`, `$ilike`) dan konjungsi logis (`$and`, `$or`).
- `SearchQuery<T>`: Struktur standar untuk operasi baca (memiliki `projection`, `filter`, `order`, `limit`, `offset`).

### 2. The Metadata Bridge & Inferrer
Drizzle tidak memiliki relasi Tipe TypeScript bawaan antar tabel. Layer ini menjembataninya.
- `StrictSchemaMetadata`: Tipe yang memaksa metadata relasi (oneToMany, manyToMany, dll) HANYA menggunakan nama tabel dan kolom yang benar-benar ada di *Drizzle Table Instance*.
- `InferEntity<TSchema, TTableName>`: Engine rekursif yang secara ajaib menyatukan Base Table dengan Relasinya berdasarkan Metadata yang didefinisikan pengguna. (Membentuk *Nested Object*).

### 3. The Contextual Builder (`defineSchemaMetadata`)
Fungsi *factory* utama. Menggunakan *Currying* untuk mengunci tipe database (`TDb`) dan array tabel (`TTables`), lalu menerima definisi relasi.
- Penting: Fungsi ini menerima *Drizzle DB Instance* sebagai parameter pertama untuk diekspos ke metode implementasi (runtime).

### 4. Enterprise Features (Hooks, Soft-Delete, RBAC)
Sistem ini dilengkapi dengan konfigurasi standar *Enterprise*:
- `config()`: Menerapkan siklus hidup eksekusi (Lifecycle Hooks) seperti `beforeCreate`, `afterSearch`, serta konfigurasi `softDelete`.
- `repoFactory()`: Menghasilkan objek *Repository* (CRUD+ functions) berdasarkan tabel. Mendukung *Role-Based Access Control (RBAC)* melalui argumen `profile` (e.g., 'admin', 'default') yang mengatur `allowedProjections`, `allowedFilters`, dan `allowedSets` per aksi.

## Complete Code Context (The "Extremely Type-Safe" Engine)

Berikut adalah ringkasan inti dari Engine yang sudah di-resolve (Bebas dari error `& {} & {}` dan error `Pick`):

### 1. Base Builder & Helper
```typescript
import { AnyPgTable } from "drizzle-orm/pg-core"; // Sesuaikan dengan dialek (MySQL/SQLite)

export type TableName<T extends AnyPgTable> = T["_"]["name"];
export type ColumnName<T extends AnyPgTable> = Extract<keyof T["_"]["columns"], string>;
export type ColumnPath<T extends AnyPgTable> = `${TableName<T>}.${ColumnName<T>}`;
export type InferModel<TTable> = TTable extends { $inferSelect: infer U } ? U : never;
export type InferInsert<TTable> = TTable extends { $inferInsert: infer U } ? U : never;
export type FindTable<TTables extends readonly any[], TName string> = Extract<TTables[number], { _: name: TName }>;
```

### 2. Entity Inference (The Magic)
```typescript
type ExtractRelationsArray<TMeta, K extends string> = K extends keyof TMeta ? (TMeta[K] extends readonly any[] ? TMeta[K] : []) : [];
type GetTableMeta<TSchema extends { metadata: any }, TTableName string> = TTableName extends keyof TSchema["metadata"] ? TSchema["metadata"][TTableName] : {};

export type InferEntity<
  TSchema extends { tables: readonly any[]; metadata: any },
  TTableName extends string,
  TDepth extends any[] = []
> = TDepth["length"] extends 3
  ? InferModel<FindTable<TSchema["tables"], TTableName>>
  : InferModel<FindTable<TSchema["tables"], TTableName>> & 
      {
        [R in ExtractRelationsArray<GetTableMeta<TSchema, TTableName>, "oneToMany" | "manyToMany">[number] as R["relationName"] & string]: Array<InferEntity<TSchema, R["relatedTable"], [...TDepth, any]>>;
      } & {
        [R in ExtractRelationsArray<GetTableMeta<TSchema, TTableName>, "oneToOne" | "manyToOne">[number] as R["relationName"] & string]: InferEntity<TSchema, R["relatedTable"], [...TDepth, any]>;
      };
```

### 3. The Repository Definition
```typescript
export type Repository<
  TSchema extends { db: any, tables: readonly any[]; metadata: any },
  TTableName extends keyof TSchema["metadata"] & string,
  TProfiles extends Record<string, any>,
  TEntity = InferEntity<TSchema, TTableName>,
  TInsert = InferInsert<FindTable<TSchema["tables"], TTableName>>
> = {
  createOne: <P extends keyof TProfiles | (string & {})="default">(data: TInsert, profile?: P) => Promise<TEntity>;
  searchOne: <P extends keyof TProfiles | (string & {})="default">(query: Pick<SearchQuery<TEntity>, 'projection' | 'filter'>, profile?: P) => Promise<TEntity | null>;
  searchPage: <P extends keyof TProfiles | (string & {})="default">(query: SearchQuery<TEntity>, profile?: P) => Promise<{ data: TEntity[], total: number }>;
  // ... and other methods (updateOne, softDeleteOne, restoreMany, etc.)
};
```

### 4. The Builder Function
```typescript
export function defineSchemaMetadata<TDb, const TTables extends readonly any[]>(db: TDb, tables: TTables) {
  return function <const TMetadata extends StrictSchemaMetadata<TTables>["metadata"]>(metadata: TMetadata) {
    const _schemaObj = { db, tables, metadata };
    type TSchemaContext = typeof _schemaObj;

    return {
      db, tables, metadata,
      config: <TName extends keyof TMetadata & string>(tableName: TName, options: TableConfig<TSchemaContext, TName>) => { /* Implementation */ },
      repoFactory: <
        TName extends keyof TMetadata & string,
        const TProfiles extends Record<string, RepoProfileConfig<TSchemaContext, TName>>
      >(tableName: TName, options: { profiles: TProfiles }): Repository<TSchemaContext, TName, TProfiles> => {
         // IMPLEMENT RUNTIME DRIZZLE LOGIC HERE USING `db`
         return {} as any;
      }
    };
  };
}