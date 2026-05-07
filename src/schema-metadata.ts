import { executeCreateOne, executeCreateMany } from "./mutations/create";
import { executeSearchOne, executeSearchPage, executeSearchMany } from "./queries/search";
import { getTableName } from "drizzle-orm";
import type { AnyDatabase, TSchemaMetadata, TTableNames, TProfileOptions, Repository, TSchemaContext, DbAction, AnyTable } from "./types";

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
          throw new Error(
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
            throw new Error(
              `[Access Denied] None of the profiles '${profileStr}' are defined for table '${tableName}'.`,
            );
          }
          throw new Error(
            `[Access Denied] Action '${action}' is denied for profiles '${profileStr}' on table '${tableName}'.`,
          );
        }
      };

      return {
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
          checkAccess("read", profile as any);
          console.log(
            `Executing searchDeletedOne on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        searchDeletedPage: async (query, profile) => {
          checkAccess("read", profile as any);
          console.log(
            `Executing searchDeletedPage on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        searchDeletedMany: async (query, profile) => {
          checkAccess("read", profile as any);
          console.log(
            `Executing searchDeletedMany on ${tableName} with query:`,
            query,
          );
          throw new Error("Not implemented");
        },
        updateOne: async (id, set, profile) => {
          checkAccess("update", profile as any);
          console.log(
            `Executing updateOne on ${tableName} with id: ${id} and set:`,
            set,
          );
          throw new Error("Not implemented");
        },
        updateMany: async (filter, set, profile) => {
          checkAccess("update", profile as any);
          console.log(
            `Executing updateMany on ${tableName} with filter:`,
            filter,
            "and set:",
            set,
          );
          throw new Error("Not implemented");
        },
        softDeleteOne: async (id, profile) => {
          checkAccess("softDelete", profile as any);
          console.log(`Executing softDeleteOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        softDeleteMany: async (filter, profile) => {
          checkAccess("softDelete", profile as any);
          console.log(
            `Executing softDeleteMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
        },
        restoreOne: async (id, profile) => {
          checkAccess("restore", profile as any);
          console.log(`Executing restoreOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        restoreMany: async (filter, profile) => {
          checkAccess("restore", profile as any);
          console.log(
            `Executing restoreMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
        },
        hardDeleteOne: async (id, profile) => {
          checkAccess("hardDelete", profile as any);
          console.log(`Executing hardDeleteOne on ${tableName} with id: ${id}`);
          throw new Error("Not implemented");
        },
        hardDeleteMany: async (filter, profile) => {
          checkAccess("hardDelete", profile as any);
          console.log(
            `Executing hardDeleteMany on ${tableName} with filter:`,
            filter,
          );
          throw new Error("Not implemented");
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
