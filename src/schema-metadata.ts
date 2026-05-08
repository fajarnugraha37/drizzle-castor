import { executeCreateOne, executeCreateMany } from "./mutations/create";
import { executeUpdateOne, executeUpdateMany } from "./mutations/update";
import { executeSearchOne, executeSearchPage, executeSearchMany, executeSearchDeletedOne, executeSearchDeletedPage, executeSearchDeletedMany } from "./queries/search";
import { executeHardDeleteOne, executeHardDeleteMany } from "./mutations/delete";
import { executeSoftDeleteOne, executeSoftDeleteMany, executeRestoreOne, executeRestoreMany } from "./mutations/soft-delete";
import { getTableName } from "drizzle-orm";
import type { AnyDatabase, TSchemaMetadata, TTableNames, TProfileOptions, Repository, TSchemaContext, DbAction, AnyTable } from "./types";
import { AccessDeniedError } from "./errors";

export function defineSchemaMetadata<
  TDb extends AnyDatabase,
  TTables extends readonly AnyTable[],
>(db: TDb, tables: TTables, mode: "strict" | "lenient" = "lenient") {
  if (mode === "lenient") {
    console.warn(
      "[Drizzle-Castor] Warning: Running in lenient mode. Unprotected tables will allow all actions by default.",
    );
  }

  return function <const TMetadata extends TSchemaMetadata<TDb, TTables>>(
    metadata: TMetadata,
  ) {
    const repoFactory = <
      TName extends TTableNames<TDb, TTables, TMetadata>,
      TProfiles extends TProfileOptions<TDb, TTables, TMetadata, TName>,
    >(
      tableName: TName,
      options: TProfiles,
    ): Repository<
      TSchemaContext<TDb, TTables, TMetadata>,
      TName,
      TProfiles
    > => {
      const translatorContext = {
        db,
        tables,
        metadata,
        baseTableName: tableName,
      };

      const checkAccess = (
        action: DbAction,
        requestedProfile?: string | string[],
      ) => {
        const tableConfig = (metadata as any)[tableName];

        if (
          !tableConfig ||
          !tableConfig.profiles ||
          Object.keys(tableConfig.profiles).length === 0
        ) {
          if (mode === "lenient") return; // Allow by default in lenient mode
          throw new AccessDeniedError(
            `[Access Denied] Table '${tableName}' has no profiles defined in strict mode.`,
          );
        }

        const profilesToCheck = requestedProfile
          ? Array.isArray(requestedProfile)
            ? requestedProfile
            : [requestedProfile]
          : ["default"];

        if (profilesToCheck.length === 0) {
          profilesToCheck.push("default");
        }

        let hasAccess = false;
        let missingProfiles: string[] = [];

        for (const profileName of profilesToCheck) {
          const allowedActions = tableConfig.profiles[profileName];
          if (!allowedActions) {
            missingProfiles.push(profileName);
            continue;
          }
          if (allowedActions.includes(action)) {
            hasAccess = true;
            break;
          }
        }

        if (!hasAccess) {
          const profileStr = profilesToCheck.join(", ");
          if (missingProfiles.length === profilesToCheck.length) {
            throw new AccessDeniedError(
              `[Access Denied] None of the profiles '${profileStr}' are defined for table '${tableName}'.`,
            );
          }
          throw new AccessDeniedError(
            `[Access Denied] Action '${action}' is denied for profiles '${profileStr}' on table '${tableName}'.`,
          );
        }
      };

      return {
        // --- FACTORY METHODS ---
        defineFilter: (f) => f,
        defineProjection: (p) => p,
        defineQuery: (q) => q,
        defineUpdateSet: (s) => s,
        defineInsertValue: (i) => i,

        createOne: async (data, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeCreateOne(data, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        createMany: async (data, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeCreateMany(data, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        searchOne: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchOne(query, checkAccess, profile as any, hooks, translatorContext, tableName);
        },
        searchPage: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchPage(query, checkAccess, profile as any, hooks, translatorContext, tableName) as any;
        },
        searchMany: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchMany(query, checkAccess, profile as any, hooks, translatorContext, tableName);
        },
        searchDeletedOne: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchDeletedOne(query, checkAccess, profile as any, hooks, translatorContext, tableName);
        },
        searchDeletedPage: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchDeletedPage(query, checkAccess, profile as any, hooks, translatorContext, tableName) as any;
        },
        searchDeletedMany: async (query, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          return executeSearchDeletedMany(query, checkAccess, profile as any, hooks, translatorContext, tableName);
        },
        updateOne: async (id, set, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeUpdateOne(id, set, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        updateMany: async (filter, set, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeUpdateMany(filter, set, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        softDeleteOne: async (id, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeSoftDeleteOne(id, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        softDeleteMany: async (filter, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeSoftDeleteMany(filter, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        restoreOne: async (id, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeRestoreOne(id, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        restoreMany: async (filter, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeRestoreMany(filter, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        hardDeleteOne: async (id, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeHardDeleteOne(id, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
        hardDeleteMany: async (filter, profile) => {
          const tableConfig = (metadata as any)[tableName];
          const hooks = tableConfig?.hooks;
          const baseTable = tables.find((t) => getTableName(t) === tableName);
          return executeHardDeleteMany(filter, checkAccess, profile as any, hooks, translatorContext, baseTable);
        },
      };
    };

    return {
      db,
      tables,
      metadata,
      repoFactory,
    };
  };
}
