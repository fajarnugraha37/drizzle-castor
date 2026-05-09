import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { AnyD1Database } from "drizzle-orm/d1";
import type { TableConfig } from "./hook";
import type { RepoProfileConfig } from "./repository";

export type AnyDatabase =
  | BunSQLiteDatabase
  | BetterSQLite3Database
  | LibSQLDatabase
  | PostgresJsDatabase
  | NodePgDatabase
  | MySql2Database
  | AnyD1Database;

export type AnyTable = AnySQLiteTable | AnyMySqlTable | AnyPgTable;

export type AliasMap = Map<string, AnyTable>;

export type TableName<T extends AnyTable> = T["_"]["name"];
export type ColumnName<T extends AnyTable> = Extract<
  keyof T["_"]["columns"],
  string
>;
export type ColumnPath<T extends AnyTable> = `${TableName<T>}.${ColumnName<T>}`;

export type StrictRelations<
  TAllTables extends AnyTable,
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
  TMetadata extends Record<string, any> = any,
> = {
  db: TDb;
  tables: TTables;
  metadata: TMetadata;
};

export type TTranslatorContext<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends TSchemaMetadata<TDb, TTables> = TSchemaMetadata<TDb, TTables>,
> = TSchemaContext<TDb, TTables, TMetadata> & {
  baseTableName: TTableNames<TDb, TTables, TMetadata>;
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

export type TTableNames<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends TSchemaMetadata<TDb, TTables>,
> = keyof TMetadata & string;

export type TProfileNames<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends TSchemaMetadata<TDb, TTables>,
  TName extends TTableNames<TDb, TTables, TMetadata>,
> = TMetadata[TName] extends { profiles: infer P }
  ? keyof P & string
  : "default";

export type TProfileOptions<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
  TMetadata extends TSchemaMetadata<TDb, TTables>,
  TName extends TTableNames<TDb, TTables, TMetadata>,
> = {
  [K in TProfileNames<TDb, TTables, TMetadata, TName> | (string & {})]?: RepoProfileConfig<
    TSchemaContext<TDb, TTables, TMetadata>,
    TName
  >;
};
