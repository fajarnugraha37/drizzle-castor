import { existsSync } from "fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DefaultLogger, Logger } from "drizzle-orm";
import { createSchemaBuilder } from "../dist";
import {
  commentsTable,
  companiesTable,
  groupsTable,
  postsTable,
  profilesTable,
  userGroups,
  usersTable,
} from "./schema";

export function getDatabaseFileLocation(): string {
  for (const arg of ["../db.sqlite", "./db.sqlite", "./example/db.sqlite"]) {
    if (existsSync(arg)) {
      return arg;
    }
  }
  throw new Error(
    "Database file not found. Please ensure 'db.sqlite' exists in the project root or parent directory.",
  );
}

export const listOfProfiles = ["default", "public", ["public", "admin"], "admin"] as const;

export async function isHasUsersData(pageSize = 50) {
  const userRepo = schemaMetadata.repoFactory("users", {});
  const users = await userRepo.searchPage(
    {
      pageSize,
    },
    "admin",
  );
  if (users.meta.totalItems === 0) {
    throw new Error("No users found. Please run the seed script first.");
  }

  return users;
}

// if in arguments there is --verbose
const isVerbose = process.argv.includes("--verbose");
export const db = drizzle(getDatabaseFileLocation(), {
  logger: new DefaultLogger({
    writer: new (class implements Logger {
      logQuery(query: string, params: unknown[]): void {
        if (!isVerbose) return;
        console.log("[DRIZZLE] >>> ", query, params);
        console.log();
      }
      write(message: string): void {
        if (!isVerbose) return;
        console.log("[DRIZZLE] >>> ", message);
        console.log();
      }
    })(),
  }),
});

export const schemaMetadata = createSchemaBuilder(db, [
  companiesTable,
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  groupsTable,
  userGroups,
] as const)
  .table("users", {
    oneToOne: [
      {
        relationName: "profile",
        relatedTable: "profiles",
        localKey: "users.id",
        foreignKey: "profiles.userId",
      },
      {
        relationName: "company",
        relatedTable: "companies",
        localKey: "users.companyId",
        foreignKey: "companies.id",
      },
    ],
    oneToMany: [
      {
        relationName: "posts",
        relatedTable: "posts",
        localKey: "users.id",
        foreignKey: "posts.userId",
      },
    ],
    manyToMany: [
      {
        relationName: "groups",
        joinTable: "users_to_groups",
        localKey: "users.id",
        joinLocalKey: "users_to_groups.userId",
        relatedTable: "groups",
        relatedKey: "groups.id",
        joinRelatedKey: "users_to_groups.groupId",
      },
    ],
    profiles: {
      default: ["read"],
      public: ["read"],
      admin: [
        "create",
        "read",
        "update",
        "softDelete",
        "restore",
        "hardDelete",
      ],
    },
    hooks: {
      beforeSearch: async (query): Promise<void> => {
        // console.log(`[Hooks] Before search hook triggered`);
        // console.log(`[Hooks] Before search hook triggered for users with query:`, query);
      },
      afterSearch: async (query, result): Promise<void> => {
        // console.log(`[Hooks] After search hook triggered`);
        // console.log(`[Hooks] After search hook triggered for users with query:`, query);
        // console.log(`[Hooks] Search result:`, result[0]?.name);
      },
      beforeCreate: async (data): Promise<void> => {
        // console.log(`[Hooks] Before create hook triggered`);
        // console.log(`[Hooks] Before create hook triggered for users with data:`, data);
      },
      afterCreate: async (data): Promise<void> => {
        // console.log(`[Hooks] After create hook triggered`);
        // console.log(`[Hooks] After create hook triggered for users with data:`, data);
        // console.log(`[Hooks] Created user:`, result.name);
      },
      beforeUpdate: async (filter, data): Promise<void> => {
        // console.log(`[Hooks] Before update hook triggered`);
        // console.log(`[Hooks] Before update hook triggered for users with filter:`, filter, `and data:`, data);
      },
      afterUpdate: async (data, result): Promise<void> => {
        // console.log(`[Hooks] After update hook triggered`);
        // console.log(`[Hooks] After update hook triggered for users with filter:`, filter, `and data:`, data);
        // console.log(`[Hooks] Updated user:`, result[0]?.name);
      },
      beforeSoftDelete: async (filter): Promise<void> => {
        // console.log(`[Hooks] Before soft delete hook triggered`);
        // console.log(`[Hooks] Before soft delete hook triggered for users with filter:`, filter);
      },
      afterSoftDelete: async (filter): Promise<void> => {
        // console.log(`[Hooks] After soft delete hook triggered`);
        // console.log(`[Hooks] After soft delete hook triggered for users with filter:`, filter);
        // console.log(`[Hooks] Soft deleted user:`, result[0]?.name);
      },
      beforeRestore: async (filter): Promise<void> => {
        // console.log(`[Hooks] Before restore hook triggered`);
        // console.log(`[Hooks] Before restore hook triggered for users with filter:`, filter);
      },
      afterRestore: async (result): Promise<void> => {
        // console.log(`[Hooks] After restore hook triggered`);
        // console.log(`[Hooks] After restore hook triggered for users with filter:`, filter);
        // console.log(`[Hooks] Restored user:`, result[0]?.name);
      },
      beforeHardDelete: async (filter): Promise<void> => {
        // console.log(`[Hooks] Before hard delete hook triggered`);
        // console.log(`[Hooks] Before hard delete hook triggered for users with filter:`, filter);
      },
      afterHardDelete: async (result): Promise<void> => {
        // console.log(`[Hooks] After hard delete hook triggered`);
        // console.log(`[Hooks] After hard delete hook triggered for users with filter:`, filter);
        // console.log(`[Hooks] Hard deleted user:`, result[0]?.name);
      },
    },
    softDelete: {
      deleteValue: {
        deletedFlag: 1,
      },
      restoreValue: {
        deletedFlag: 0,
      },
    },
  })
  .table("profiles", {
    oneToOne: [
      {
        relationName: "user",
        relatedTable: "users",
        localKey: "profiles.userId",
        foreignKey: "users.id",
      },
    ],
  })
  .table("comments", {
    manyToOne: [
      {
        relationName: "post",
        relatedTable: "posts",
        localKey: "comments.postId",
        foreignKey: "posts.id",
      },
    ],
  })
  .table("companies", {
    oneToMany: [
      {
        relationName: "users",
        relatedTable: "users",
        localKey: "companies.id",
        foreignKey: "users.companyId",
      },
    ],
  })
  .table("groups", {
    manyToMany: [
      {
        relationName: "users",
        joinTable: "users_to_groups",
        localKey: "groups.id",
        joinLocalKey: "users_to_groups.groupId",
        relatedTable: "users",
        relatedKey: "users.id",
        joinRelatedKey: "users_to_groups.userId",
      },
    ],
  })
  .table("posts", {
    manyToOne: [
      {
        relationName: "user",
        relatedTable: "users",
        localKey: "posts.userId",
        foreignKey: "users.id",
      },
    ],
    oneToMany: [
      {
        relationName: "comments",
        relatedTable: "comments",
        localKey: "posts.id",
        foreignKey: "comments.postId",
      },
    ],
  })
  .table("users_to_groups", {
    manyToOne: [
      {
        relationName: "user",
        relatedTable: "users",
        localKey: "users_to_groups.userId",
        foreignKey: "users.id",
      },
    ],
  })
  .build();
