import { sql, getTableColumns, type Dialect } from "drizzle-orm";
import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as getMySqlTableConfig } from "drizzle-orm/mysql-core";
import { getTableConfig as getSQLiteTableConfig } from "drizzle-orm/sqlite-core";

/**
 * Detects the dialect of the given Drizzle database instance.
 * Uses characteristic probing (duck-typing) to be robust against minification.
 */
export function getDialect(db: any): Dialect {
  const dialect = db?.dialect;
  if (!dialect) return "sqlite";

  // 1. Check for PostgreSQL characteristics (uses $1 style parameters)
  if (typeof dialect.escapeParam === 'function') {
    const param = dialect.escapeParam(0, null);
    if (typeof param === 'string' && param.startsWith('$')) {
      return "pg";
    }
  }

  // 2. Check for MySQL characteristics (uses backticks for escaping names)
  if (typeof dialect.escapeName === 'function') {
    const escaped = dialect.escapeName('a');
    if (escaped === '`a`') {
      return "mysql";
    }
  }

  // 3. Fallback to SQLite (uses double quotes for escaping names like PG, but ? for params)
  return "sqlite";
}

/**
 * Checks if the dialect supports the .returning() clause.
 */
export function supportsReturning(db: any): boolean {
  return getDialect(db) !== "mysql";
}

/**
 * Generates a unique temporary table name.
 */
export function generateTempTableName(): string {
  return `_tmp_castor_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Cross-dialect helper to get row count from a result object or a table.
 * Uses explicit normalization based on the detected dialect and driver variations.
 */
export async function getTempTableCount(tx: any, tableIdent: any): Promise<number> {
  const result: any = await tx.execute(sql`SELECT COUNT(*) as count FROM ${tableIdent}`);
  const dialect = getDialect(tx);
  
  let rows: any[] = [];

  if (dialect === "mysql") {
    // mysql2 returns [rows, fields]
    rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : (Array.isArray(result) ? result : []);
  } else if (dialect === "pg") {
    // FIX MEDIUM: Robust PG driver handling (node-postgres uses .rows, postgres.js is an array)
    rows = Array.isArray(result) ? result : (result?.rows || []);
  } else {
    // sqlite drivers (better-sqlite3, d1, etc.) return rows directly
    rows = Array.isArray(result) ? result : [];
  }
  
  if (!rows || rows.length === 0) return 0;
  
  // Extract count from first row, handling varied naming conventions
  const firstRow = rows[0];
  const count = firstRow?.count ?? firstRow?.["COUNT(*)"] ?? firstRow?.["count(*)"] ?? 0;
  
  return Number(count);
}

/**
 * Robustly retrieves the full configuration of a Drizzle table regardless of dialect.
 */
export function getTableConfig(table: any): any {
  if (!table) return null;

  // Detect by entityKind marker if available  
  const kind = table.constructor?.[Symbol.for('drizzle:EntityKind')];
  if (kind === 'PgTable') return getPgTableConfig(table);
  if (kind === 'MySqlTable') return getMySqlTableConfig(table);
  if (kind === 'SQLiteTable') return getSQLiteTableConfig(table);

  // Fallback probing: Try each core's getTableConfig  
  try {
    const config = getPgTableConfig(table);
    if (config && config.columns) return config;
  } catch {}
  try {
    const config = getMySqlTableConfig(table);
    if (config && config.columns) return config;
  } catch {}
  try {
    const config = getSQLiteTableConfig(table);
    if (config && config.columns) return config;
  } catch {}
  
  return null;
}

/**
 * Robustly retrieves the primary key property names (keys in the schema definition) from a Drizzle table.
 * Handles both column-level and table-level (composite) definitions.
 */
export function getPrimaryKeyPropertyNames(table: any): string[] {
  const cols = getTableColumns(table);
  const pkPropertyNames = new Set<string>();

  // 1. Check column-level primary keys (fastest)
  for (const [key, col] of Object.entries(cols || {})) {
    if ((col as any).primary || (col as any).isPrimaryKey) {
      pkPropertyNames.add(key);
    }
  }

  // 2. Check table-level primary keys (composite or explicitly defined in extraConfig)
  const config = getTableConfig(table);
  if (config && Array.isArray(config.primaryKeys)) {
    // FIX MEDIUM: Cache Object.entries once outside the nested loops for efficiency
    const colEntries = Object.entries(cols);

    for (const pk of config.primaryKeys) {
      if (Array.isArray(pk.columns)) {
        for (const pkCol of pk.columns) {
          const dbName = pkCol.name;
          if (!dbName) continue;
          
          // Match by database name to property name using cached entries
          for (const [propName, col] of colEntries) {
            if ((col as any).name === dbName) {
              pkPropertyNames.add(propName);
              break;
            }
          }
        }
      }
    }
  }

  return Array.from(pkPropertyNames);
}
