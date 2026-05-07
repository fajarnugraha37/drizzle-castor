import { drizzle } from "drizzle-orm/bun-sqlite";
import { createSchemaBuilder, defineSchemaMetadata } from "../";
import type {  } from "../";
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
import { getDatabaseFileLocation } from "./helper";

{
  const command = process.argv.splice(2).join(" ");
  const db = drizzle(getDatabaseFileLocation(), {
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
  const tables = [
    companiesTable,
    usersTable,
    profilesTable,
    postsTable,
    commentsTable,
    groupsTable,
    userGroups,
  ] as const;
  const _ = defineSchemaMetadata(db, tables);
  const metadata = _({
    users: {
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
    },
  });
  const repo = metadata.repoFactory("users", {});
  const r = repo.searchOne;
  const result = await repo.searchOne({
    filter: {
      $or: [
        { email: { $like: "Cierra_Hackett%" } },
        { "posts.title": { $like: "%sunt aut facere%" } },
        { tags: { $in: ["tag1"] } },
        { "persona.hobbies": { $in: ["footbal", "baskeet"] } },
      ],
    },
    'projection': [
      'groups.name',
      'age',
    ]
  });
  console.log("Search result:", result?.age);

  const schemaMetadata = createSchemaBuilder(db, tables)
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
      // profiles: {
      //   default: ["read"],
      //   public: [],
      //   admin: [
      //     "create",
      //     "read",
      //     "update",
      //     "softDelete",
      //     "restore",
      //     "hardDelete",
      //   ],
      // },
      // hooks: {
      //   beforeSearch: async (query): Promise<void> => {
      //     // console.log(`[Hooks] Before search hook triggered`);
      //     // console.log(`[Hooks] Before search hook triggered for users with query:`, query);
      //   },
      //   afterSearch: async (query, result): Promise<void> => {
      //     // console.log(`[Hooks] After search hook triggered`);
      //     // console.log(`[Hooks] After search hook triggered for users with query:`, query);
      //     // console.log(`[Hooks] Search result:`, result[0].name);
      //   },
      // },
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
    const userRepo = schemaMetadata.repoFactory('users', {});
    const commentRepo = schemaMetadata.repoFactory("comments", {});
    const rr = userRepo.searchOne;
  for (const profile of ["default", "public", ["public", "admin"], "admin"]) {
    try {
      const users = await userRepo.searchOne(
        {
          filter: {
            $or: [
              { email: { $like: "Cierra_Hackett%" } },
              { "posts.title": { $like: "%sunt aut facere%" } },
              { tags: { $in: ["tag1"] } },
              { "persona.hobbies": { $in: ["footbal", "baskeet"] } },
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
              aggregate: "max",
            },
            "profile.bio": {
              direction: "asc",
              aggregate: "min",
            },
            persona: "desc",
          },
          projection: ["id", "name", "tags", "email", "persona.hobbies", 'company.name', 'profile.bio'],
        },
        profile as any,
      );
      console.log(
        `Users fetched successfully with profile ${JSON.stringify(profile)}`,
        users,
      );
    } catch (e: any) {
      console.log(
        `Error fetching users with profile ${JSON.stringify(profile)}: ${e.message}`,
      );
    }
  }

  const comments = await commentRepo.searchMany({
    filter: {
    },
    projection: [
      "id",
      "content",
      "postId",
      "posts.user.name",
      "posts.title",
      "posts.user.persona.hobbies",
    ],
  });
  console.log("Comments:", JSON.stringify(comments[0], null, 2));
}
