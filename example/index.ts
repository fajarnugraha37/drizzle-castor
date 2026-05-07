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

{
  const command = process.argv.splice(2).join(" ");
  const db = drizzle("./data/db.sqlite", {
    // logger: true,
    logger: new DefaultLogger({
      writer: new (class implements Logger {
        logQuery(query: string, params: unknown[]): void {
            console.log("=============== Drizzle ===============");
            console.log("Executing query:");
            console.log(query);
            console.log("With params:");
            console.log(params);
            console.log("=======================================");
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
    users: {},
    comments: {},
    companies: {},
    groups: {},
    posts: {},
    profiles: {},
    userGroups: {},
  });
  const userRepo = schemaMetadata.repoFactory("users", {});
  const users = await userRepo.searchMany({
    filter: {
        $or: [
            { name: { $like: "%Yolanda%" } },
            { email: { $notLike: "Cierra_Hackett%" } },
        ]
    },
    order: {
      name: "asc",
      age: "desc",
    },
    projection: ["id", "name", "tags", "persona"],
  });
  console.log("Users:", users);
}
