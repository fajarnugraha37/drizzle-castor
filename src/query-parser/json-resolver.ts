import { SQL, sql, getTableColumns } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { assertSafeKey, getDialect } from "../helper";
import { ColumnNotFoundError, SecurityError } from "../errors";

/**
 * Validates a JSON path segment for safety against SQL Injection.
 * Permits only alphanumeric, underscore, dots, and array indices.
 */
function validateJsonPath(path: string): void {
  // Allowlist: letters, numbers, underscores, dots, and square brackets for arrays
  const safePattern = /^[a-zA-Z0-9_.[\]]+$/;
  if (!safePattern.test(path)) {
    throw new SecurityError(`Security Error: Invalid characters in JSON path: "${path}"`);
  }
  
  // Explicitly block prototype pollution vectors
  const parts = path.split('.');
  for (const part of parts) {
    assertSafeKey(part, `JSON path: "${path}"`);
  }
}

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
  // Security check for projection paths
  validateJsonPath(jsonPath);
  
  const dialect = getDialect(db);

  if (dialect === "pg") {
    const pgPath = `{${jsonPath.replace(/\./g, ",")}}`;
    // FIX: Use #>> to extract as text instead of #> (jsonb). 
    // This allows standard operators like $eq ("value") to work without type mismatch errors.
    return sql`${column}#>>${pgPath}`;
  } else if (dialect === "mysql") {
    const formattedPath = formatSqliteMysqlPath(jsonPath);
    const myPath = `$.${formattedPath}`;
    // FIX: Use ->> operator to return unquoted text. 
    // Prevents "value" (with quotes) failing comparison against value (without quotes).
    return sql`${column}->>${myPath}`;
  } else {
    const formattedPath = formatSqliteMysqlPath(jsonPath);
    const litePath = `$.${formattedPath}`;
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
  const dialect = getDialect(db);
  const parsedSet: Record<string, any> = {};
  const jsonMutations: Record<string, { path: string; value: any }[]> = Object.create(null);
  const tableColumns = getTableColumns(baseTable);

  for (const [key, value] of Object.entries(setParams)) {
    const dotIndex = key.indexOf(".");
    if (dotIndex !== -1) {
      const columnName = key.substring(0, dotIndex);
      const jsonPath = key.substring(dotIndex + 1);

      // Security check for update keys
      validateJsonPath(jsonPath);

      if (!Object.prototype.hasOwnProperty.call(tableColumns, columnName)) {
         throw new ColumnNotFoundError(`Column '${columnName}' not found on table '${getTableName(baseTable)}'`);
      }

      if (!jsonMutations[columnName]) {
        jsonMutations[columnName] = [];
      }
      jsonMutations[columnName].push({ path: jsonPath, value });
    } else {
      parsedSet[key] = value;
    }
  }

  for (const [columnName, mutations] of Object.entries(jsonMutations)) {
    const rawColumn = tableColumns[columnName];
    let mutationSql: SQL = rawColumn;

    if (dialect === "pg") {
      mutationSql = sql`COALESCE(${mutationSql}, '{}'::jsonb)`;
      for (const mut of mutations) {
        const pgPath = `{${mut.path.replace(/\./g, ",")}}`;
        const jsonVal = JSON.stringify(mut.value);
        mutationSql = sql`jsonb_set(${mutationSql}, ${pgPath}, ${jsonVal}::jsonb)`;
      }
    } else if (dialect === "mysql") {
      mutationSql = sql`COALESCE(${mutationSql}, JSON_OBJECT())`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        const fullPath = `$.${formattedPath}`;
        // Restore: Ensure non-scalar values are correctly handled via JSON stringification.
        const jsonVal = JSON.stringify(mut.value);
        return [sql`${fullPath}`, sql`CAST(${jsonVal} AS JSON)`];
      });
      mutationSql = sql`JSON_SET(${mutationSql}, ${sql.join(args, sql`, `)})`;
    } else {
      mutationSql = sql`COALESCE(${mutationSql}, '{}')`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        const fullPath = `$.${formattedPath}`;
        // Restore: Use json() function for SQLite to ensure value is treated as JSON.
        const jsonVal = JSON.stringify(mut.value);
        return [sql`${fullPath}`, sql`json(${jsonVal})`];
      });
      mutationSql = sql`json_set(${mutationSql}, ${sql.join(args, sql`, `)})`;
    }

    parsedSet[columnName] = mutationSql;
  }

  return parsedSet;
}
