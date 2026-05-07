import { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { AnyPgTable } from "drizzle-orm/pg-core";
import { BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { LibSQLDatabase } from "drizzle-orm/libsql";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { MySql2Database } from "drizzle-orm/mysql2";

export {};

declare global {
  export type AnyDatabase =
    | BunSQLiteDatabase
    | BetterSQLite3Database
    | LibSQLDatabase
    | PostgresJsDatabase
    | NodePgDatabase
    | MySql2Database;
  export type AnyTable = AnySQLiteTable | AnyMySqlTable | AnyPgTable;

  export type TableName<T extends AnyTable> = T["_"]["name"];
  export type ColumnName<T extends AnyTable> = Extract<
    keyof T["_"]["columns"],
    string
  >;
  export type ColumnPath<T extends AnyTable> =
    `${TableName<T>}.${ColumnName<T>}`;

  // 1. Ubah StrictRelations: Tambahkan 'readonly' di setiap array
  // Ini agar parameter <const TMetadata> yang sifatnya deep-readonly tidak error
  export type StrictRelations<
    TAllTables extends AnyTable, // Ubah ke AnyPgTable/AnyMySqlTable jika pakai Postgres/MySQL
    TLocalTable extends TAllTables,
  > = {
    oneToMany?: readonly {
      [TRelated in TAllTables as TableName<TRelated>]: {
        relationName: string;
        relatedTable: TableName<TRelated>;
        foreignKey: ColumnPath<TRelated>;
        localKey: ColumnPath<TLocalTable>;
      };
    }[TableName<TAllTables>][];
    oneToOne?: readonly {
      [TRelated in TAllTables as TableName<TRelated>]: {
        relationName: string;
        relatedTable: TableName<TRelated>;
        foreignKey: ColumnPath<TRelated>;
        localKey: ColumnPath<TLocalTable>;
      };
    }[TableName<TAllTables>][];
    manyToOne?: readonly {
      [TRelated in TAllTables as TableName<TRelated>]: {
        relationName: string;
        relatedTable: TableName<TRelated>;
        localKey: ColumnPath<TLocalTable>;
        foreignKey: ColumnPath<TRelated>;
      };
    }[TableName<TAllTables>][];
    manyToMany?: readonly {
      [TRelated in TAllTables as TableName<TRelated>]: {
        [TJoin in TAllTables as TableName<TJoin>]: {
          relationName: string;
          relatedTable: TableName<TRelated>;
          joinTable: TableName<TJoin>;
          joinLocalKey: ColumnPath<TJoin>;
          joinRelatedKey: ColumnPath<TJoin>;
          localKey: ColumnPath<TLocalTable>;
          relatedKey: ColumnPath<TRelated>;
        };
      }[TableName<TAllTables>];
    }[TableName<TAllTables>][];
  };

  export type TSchemaContext<
    TDb extends AnyDatabase,
    TTables extends readonly AnyTable[],
    TMetadata extends Record<string, any> = any
  > = {
    db: TDb;
    tables: TTables;
    metadata: TMetadata;
  };

  export type TStrictSchemaMetadata<
    TDb extends AnyDatabase,
    TTables extends readonly AnyTable[],
  > = {
    tables: TTables;
    metadata: {
      [TTable in TTables[number] as TableName<TTable>]?: StrictRelations<
        TTables[number],
        TTable
      >;
    } & {
      [TTable in TTables[number] as TableName<TTable>]?: TableConfig<
        TSchemaContext<TDb, TTables>,
        TableName<TTable>
      >;
    };
  };

  export type TSchemaMetadata<
    TDb extends AnyDatabase,
    TTables extends readonly AnyTable[],
  > = TStrictSchemaMetadata<TDb, TTables>["metadata"];
}
