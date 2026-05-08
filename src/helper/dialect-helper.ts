export type Dialect = "pg" | "mysql" | "sqlite";

/**
 * Detects the dialect of the given Drizzle database instance.
 */
export function getDialect(db: any): Dialect {
  const dialectName = db?.dialect?.constructor?.name || "";
  
  if (dialectName.startsWith("Pg")) return "pg";
  if (dialectName.startsWith("MySql")) return "mysql";
  if (dialectName.startsWith("SQLite") || dialectName.startsWith("Libsql")) return "sqlite";
  
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
