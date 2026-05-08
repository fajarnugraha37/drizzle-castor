import { SQL, sql, getTableColumns } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { assertSafeKey } from "./security";

/**
 * Validates a JSON path segment for safety against SQL Injection.
 * Permits only alphanumeric, underscore, dots, and array indices.
 */
function validateJsonPath(path: string): void {
  // Allowlist: letters, numbers, underscores, dots, and square brackets for arrays
  const safePattern = /^[a-zA-Z0-9_.[\]]+$/;
  if (!safePattern.test(path)) {
    throw new Error(`Security Error: Invalid characters in JSON path: "${path}"`);
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
  
  const dialectName = (db as any).dialect?.constructor?.name || "";

  if (dialectName.startsWith("Pg")) {
    const pgPath = `{${jsonPath.replace(/\./g, ",")}}`;
    return sql`${column}#>${pgPath}`;
  } else if (dialectName.startsWith("MySql")) {
    const myPath = `$.${jsonPath}`;
    return sql`JSON_EXTRACT(${column}, ${myPath})`;
  } else {
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
         throw new Error(`Column '${columnName}' not found on table '${getTableName(baseTable)}'`);
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

    if (dialectName.startsWith("Pg")) {
      mutationSql = sql`COALESCE(${mutationSql}, '{}'::jsonb)`;
      for (const mut of mutations) {
        const pgPath = `{${mut.path.replace(/\./g, ",")}}`;
        const jsonVal = JSON.stringify(mut.value);
        mutationSql = sql`jsonb_set(${mutationSql}, ${pgPath}, ${jsonVal}::jsonb)`;
      }
    } else if (dialectName.startsWith("MySql")) {
      mutationSql = sql`COALESCE(${mutationSql}, JSON_OBJECT())`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        const fullPath = `$.${formattedPath}`;
        return [sql`${fullPath}`, sql`CAST(${JSON.stringify(mut.value)} AS JSON)`];
      });
      mutationSql = sql`JSON_SET(${mutationSql}, ${sql.join(args, sql`, `)})`;
    } else {
      mutationSql = sql`COALESCE(${mutationSql}, '{}')`;
      const args = mutations.flatMap(mut => {
        const formattedPath = formatSqliteMysqlPath(mut.path);
        const fullPath = `$.${formattedPath}`;
        return [sql`${fullPath}`, sql`json(${JSON.stringify(mut.value)})`];
      });
      mutationSql = sql`json_set(${mutationSql}, ${sql.join(args, sql`, `)})`;
    }

    parsedSet[columnName] = mutationSql;
  }

  return parsedSet;
}
