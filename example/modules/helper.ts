import { existsSync } from "fs";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { DefaultLogger, Logger } from "drizzle-orm";
import { createSchemaBuilder } from "../../src";
import {
  commentsTable,
  companiesTable,
  groupsTable,
  postsTable,
  profilesTable,
  userGroups,
  usersTable,
} from "../schema";

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
  const userRepo = schemaMetadata.repoFactory("users");
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

export const schemaMetadataBuilder = createSchemaBuilder(db, [
  companiesTable,
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  groupsTable,
  userGroups,
] as const)
  .profiles(['default', 'public', 'admin', 'guest'] as const)
  .withLogger({
    level: "TRACE",
    // format: "[%d{HH:mm:ss}] %p [%c] (%t) %{tableName}.%{action} - %s%e%n"
    format: "%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %s%e%n"
  })
  .policies('users', {
    default: { 
      allowedActions: ["read"],
      allowedProjections: [
        "id",
        "name",
        "email",
        "age",
        "zipCode",
        "stringId",
        "persona",
        "occupational",
        "settings",
      ],
      allowedFilters: "*",
      allowedSorts: "*",
    },
    public: { 
      allowedActions: "*",
      allowedFilters: ["name", "email"],
      allowedProjections: ["name"]
    },
    admin: {
      allowedActions: ["create", "read", "update", "softDelete", "restore", "hardDelete"],
      allowedSets: "*",
      allowedProjections: "*",
      allowedFilters: "*",
      allowedSorts: "*"
    },
    'guest': async (ctx) => {
      return {
        allowedActions: ["create", "read", "update", "softDelete", "restore", "hardDelete"],
        allowedSets: "*",
        allowedProjections: "*",
        allowedFilters: "*",
        allowedSorts: "*"
      };
    },
  })
  .use(async (ctx, next) => {
    // Determine user-friendly action name for logging
    const actionName = ctx.action.replace(/([A-Z])/g, ' $1').toLowerCase();
    
    console.log(`[Hooks] Before ${actionName} hook triggered`);
    const result = await next();
    console.log(`[Hooks] After ${actionName} hook triggered`);
    
    return result;
  }, { tables: "users" })
  .policies(async (ctx, tableName, activeProfiles) => {
    // Global Fallback Policy
    if (activeProfiles.includes("admin")) {
      return { 
        allowedActions: "*",
        allowedSets: "*",
        allowedProjections: "*",
        allowedFilters: "*",
        allowedSorts: "*"
      };
    }
    
    // Default fallback for other profiles (guest, public) on non-configured tables
    if (activeProfiles.includes("guest") || activeProfiles.includes("public")) {
      return { allowedActions: ["read"], allowedProjections: ["*"], allowedFilters: ["*"] };
    }
    
    return { allowedActions: [] }; // Deny by default
  })
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
      {
        relationName: "author",
        relatedTable: "users",
        localKey: "comments.authorId",
        foreignKey: "users.id",
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
    softDelete: {
      deleteValue: {
        deletedFlag: 1,
      },
      restoreValue: {
        deletedFlag: 0,
      },
    },
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
  });

export const schemaMetadata = schemaMetadataBuilder.build();
