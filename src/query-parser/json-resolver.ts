import { SQL, sql } from "drizzle-orm";

/**
 * Automatically detects the SQL dialect from the Drizzle database instance
 * and generates the appropriate JSON extraction SQL snippet.
 */
export function buildJsonExtractionSql(
  db: any,
  column: SQL | unknown,
  jsonPath: string,
): SQL {
  const dialectName = (db as any).dialect?.constructor?.name || "";

  if (dialectName.startsWith("Pg")) {
    // PostgreSQL syntax: column #> '{path,to,key}'
    const pgPath = `{${jsonPath.replace(/\./g, ",")}}`;
    return sql`${column}#>${pgPath}`;
  } else if (dialectName.startsWith("MySql")) {
    // MySQL syntax: JSON_EXTRACT(column, '$.path')
    const myPath = `$.${jsonPath}`;
    return sql`JSON_EXTRACT(${column}, ${myPath})`;
  } else {
    // Default fallback (SQLite): json_extract(column, '$.path')
    const litePath = `$.${jsonPath}`;
    return sql`json_extract(${column}, ${litePath})`;
  }
}
