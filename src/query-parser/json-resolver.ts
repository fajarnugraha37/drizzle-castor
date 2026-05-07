import { SQL, sql } from "drizzle-orm";
import { getTableName } from "drizzle-orm";

function formatSqliteMysqlPath(path: string): string {
  return path.split('.').map(part => {
    if (!isNaN(Number(part))) {
      return `[${part}]`;
    }
    return part;
  }).join('.').replace(/\.\[/g, '[');
}

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

/**
 * Parses the raw setParams (which may contain dot-notation JSON paths)
 * into a valid Drizzle update object where JSON updates are converted to raw SQL mutations.
 */
export function parseUpdateSet(
  db: any,
  baseTable: any,
  setParams: Record<string, any>
): Record<string, any> {
  const dialectName = (db as any).dialect?.constructor?.name || "";
  const parsedSet: Record<string, any> = {};
  
  // Group JSON mutations by physical column name
  const jsonMutations: Record<string, { path: string; value: any }[]> = {};

  for (const [key, value] of Object.entries(setParams)) {
    const dotIndex = key.indexOf(".");
    if (dotIndex !== -1) {
      // It's a JSON path
      const columnName = key.substring(0, dotIndex);
      const jsonPath = key.substring(dotIndex + 1);
      
      if (!baseTable[columnName]) {
         throw new Error(`Column '${columnName}' not found on table '${getTableName(baseTable)}'`);
      }

      if (!jsonMutations[columnName]) {
        jsonMutations[columnName] = [];
      }
      jsonMutations[columnName].push({ path: jsonPath, value });
    } else {
      // Normal column
      parsedSet[key] = value;
    }
  }

  // Build dialect-specific JSON mutation SQL for each affected column
  for (const [columnName, mutations] of Object.entries(jsonMutations)) {
    const rawColumn = baseTable[columnName];
    let mutationSql: SQL = rawColumn; // Start with the column itself

    if (dialectName.startsWith("Pg")) {
      // PostgreSQL: jsonb_set(COALESCE(col, '{}'::jsonb), '{path}', 'val'::jsonb)
      mutationSql = sql`COALESCE(${mutationSql}, '{}'::jsonb)`;
      for (const mut of mutations) {
        const pgPath = `{${mut.path.replace(/\./g, ",")}}`;
        const jsonVal = JSON.stringify(mut.value);
        mutationSql = sql`jsonb_set(${mutationSql}, ${pgPath}, ${jsonVal}::jsonb)`;
      }
    } else if (dialectName.startsWith("MySql")) {
      // MySQL: JSON_SET(COALESCE(col, JSON_OBJECT()), '$.path', CAST('val' AS JSON))
      mutationSql = sql`COALESCE(${mutationSql}, JSON_OBJECT())`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        return [sql`'$.${sql.raw(formattedPath)}'`, sql`CAST(${JSON.stringify(mut.value)} AS JSON)`];
      });
      mutationSql = sql`JSON_SET(${mutationSql}, ${sql.join(args, sql`, `)})`;
    } else {
      // SQLite: json_set(COALESCE(col, '{}'), '$.path', json('val'))
      mutationSql = sql`COALESCE(${mutationSql}, '{}')`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        return [sql`'$.${sql.raw(formattedPath)}'`, sql`json(${JSON.stringify(mut.value)})`];
      });
      mutationSql = sql`json_set(${mutationSql}, ${sql.join(args, sql`, `)})`;
    }

    parsedSet[columnName] = mutationSql;
  }

  return parsedSet;
}
