/// <reference path="../src/types/global.d.ts" />
/// <reference path="../src/types/helper.d.ts" />
/// <reference path="../src/types/query.ts" />
/// <reference path="../src/types/schema-metadata.d.ts" />

import { drizzle } from "drizzle-orm/bun-sqlite";
import { defineSchemaMetadata } from "../src/index";
import { seed } from "./seed";
import {
  companiesTable,
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  groupsTable,
  userGroups,
} from "./schema";
import { DefaultLogger, Logger } from "drizzle-orm";
import {} from "bun";

{
  const command = process.argv.splice(2).join(" ");
  const db = drizzle("db.sqlite", {
    // logger: true,
    logger: new DefaultLogger({
      writer: new (class implements Logger {
        logQuery(query: string, params: unknown[]): void {
          // console.log("=============== Drizzle ===============");
          // console.log("Executing query:");
          // console.log(query);
          // console.log("With params:");
          // console.log(params);
          // console.log("=======================================");
        }
        write(message: string): void {
          console.log("=============== Drizzle ===============");
          console.log(message);
          console.log("=======================================");
        }
      })(),
    }),
  });
  switch (command) {
    case "--seed":
      console.log("Seeding database...");
      await seed(db, process.argv.splice(2));
      console.log("Database seeded successfully.");
      break;
    case "--main":
      console.log("Running main function...");
      await main(db, process.argv.splice(2));
      console.log("Main function executed successfully.");
      break;
    default:
      console.log(
        "Unknown command. Use '--seed' to seed the database or '--main' to run the main function.",
      );
      break;
  }
}

async function main(db: any, args?: string[]) {
  const schemaMetadata = defineSchemaMetadata(db, [
    companiesTable,
    usersTable,
    profilesTable,
    postsTable,
    commentsTable,
    groupsTable,
    userGroups,
  ] as const)({
    users: {
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
        public: [],
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
          // console.log(`[Hooks] Search result:`, result[0].name);
        },
      },
    },
    profiles: {
      oneToOne: [
        {
          relationName: "user",
          relatedTable: "users",
          localKey: "profiles.userId",
          foreignKey: "users.id",
        },
      ],
    },
    comments: {
      manyToOne: [
        {
          relationName: "post",
          relatedTable: "posts",
          localKey: "comments.postId",
          foreignKey: "posts.id",
        },
      ],
    },
    companies: {
      oneToMany: [
        {
          relationName: "users",
          relatedTable: "users",
          localKey: "companies.id",
          foreignKey: "users.companyId",
        },
      ],
    },
    groups: {
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
    },
    posts: {
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
    },
    userGroups: {
      manyToOne: [
        {
          relationName: "user",
          relatedTable: "users",
          localKey: "userGroups.userId",
          foreignKey: "users.id",
        },
      ],
    },
  });
  const userRepo = schemaMetadata.repoFactory("users", {});
  const commentRepo = schemaMetadata.repoFactory("comments", {});
  for (const profile of ['default', 'public', ['public', 'admin'], 'admin']) {
    try {
      const users = await userRepo.searchOne({
        filter: {
            $or: [
                { email: { $notLike: "Cierra_Hackett%" } },
                { "posts.title": { $like: "%sunt aut facere%" } },
            ],
        },
        order: {
          name: {
            direction: "asc",
            nulls: "last",
          },
          age: {
            direction: "desc",
            nulls: "last",
            aggregate: 'max',
          },
          "profile.bio": {
            direction: "asc",
            aggregate: 'min',
          }
        },
        projection: [
          "id", 
          "name", 
          "tags", 
          "email", 
        ],
      }, profile as any);
      console.log(`Users fetched successfully with profile ${JSON.stringify(profile)}`);
    } catch (e: any) {
      console.log(`Error fetching users with profile ${JSON.stringify(profile)}: ${e.message}`);
    }
  }

  const comments = await commentRepo.searchMany({
    filter: {},
    projection: ["id", "content", "postId", "post.user.name", "post.title"],
  });
  console.log("Comments:", comments[0]);
}
