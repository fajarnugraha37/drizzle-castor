import "bun";
import { seed } from "./modules/seed";
import { schemaMetadataBuilder } from "./modules/helper";
import { createExample } from "./modules/create.example";
import { updateExample } from "./modules/update.example";
import { readExample } from "./modules/read.example";
import { hardDeleteExample } from "./modules/hard-delete.example";
import { softDeleteExample } from "./modules/soft-delete.example";
import { isQueryError, isSecurityError } from "../src";
import { Middleware } from "../dist";

{
  const [, , command, subCommand, ...args] = process.argv;
  console.log(`> Command: ${command}, Subcommand: ${subCommand}, Args: ${args.join(" ")}`);
  switch (command) {
    case "--seed":
      await seed(args);
      break;
    case "--main":
      switch (subCommand) {
        case "-c":
        case "--create":
          await createExample(args);
          break;
        case "-r":
        case "--read":
          await readExample(args);
          break;
        case "-u":
        case "--update":
          await updateExample(args);
          break;
        case "-sd":
        case "--soft-delete":
          await softDeleteExample(args);
          break;
        case "-hd":
        case "--hard-delete":
          await hardDeleteExample(args);
          break;
        case "-p":
        case "--playground":
          await playground();
          break;
        default:
          console.log(
            "> No valid subcommand provided for --main. Use -c/--create, -r/--read, -u/--update, -sd/--soft-delete, -hd/--hard-delete, or -p/--playground.",
          );
          break;
      }
      break;
    default:
      console.log(
        "> No valid command provided. Use --seed to seed the database or --main with a subcommand to run the main function.",
      );
      break;
  }
}

async function playground() {
  let middlewareFired = false;
  const customMiddleware: Middleware = async (ctx, next) => {
    if (ctx.action === "read" && ctx.tableName === "users") {
      console.log(`[Custom Middleware] Intercepted ${ctx.action} action on ${ctx.tableName} table with params:`, ctx.params);
      middlewareFired = true;
    }
    return next();
  };

  const builder = schemaMetadataBuilder
    .use(customMiddleware)
    .build();

  const userRepo = builder.repoFactory("users", {
    default: {
      allowedProjections: ['name', 'persona.skills', 'settings.theme', 'occupational.period.start', 'posts.title', 'posts.comments.content'],
      allowedFilters: ['occupational.company', 'persona.skills', 'settings.theme'],
      allowedSets: ["*"],
      allowedSorts: ["*"],
    },
    admin: {
      allowedProjections: ["*"],
      allowedFilters: ["*"],
      allowedSets: ["*"],
      allowedSorts: ["*"],
    },
  });

  const one = await userRepo.searchOne({
    projection: [
      'name',
      'persona.skills.0',
      'settings.theme',
      // 'occupational.period.start',
      // 'posts.title',
      // 'posts.comments.content',
    ],
    filter: {
      'persona.skills.0': { $eq: "TypeScript" },
    },
    order: {
      'persona.skills.0': 'desc'
    }
  });
  console.log("result: ", one);

  console.log("\n--- Testing Edge Case: Unvalidated Key Access (BUG-2) ---");
  try {
    await userRepo.searchMany({
      filter: {
        "toString": { $eq: "1" }
      }
    } as any, "admin");
    console.error("❌ FAILED: The unvalidated key access did not throw an error.");
  } catch (error: any) {
    if (isQueryError(error) && error.message.includes("not found on table")) {
      console.log("✅ PASSED: Safely rejected invalid key access ('toString') with ColumnNotFoundError.");
    } else {
      console.error("❌ FAILED: Threw an unexpected error type:", error);
    }
  }

  try {
    await userRepo.searchMany({
      filter: {
        "hasOwnProperty": { $eq: "1" }
      }
    } as any, "admin");
    console.error("❌ FAILED: The unvalidated key access did not throw an error.");
  } catch (error: any) {
    if (isQueryError(error) && error.message.includes("not found on table")) {
      console.log("✅ PASSED: Safely rejected invalid key access ('hasOwnProperty') with ColumnNotFoundError.");
    } else {
      console.error("❌ FAILED: Threw an unexpected error type:", error);
    }
  }

  console.log("\n--- Testing RBAC Custom Errors ---");
  try {
    // Calling with a non-existent profile in strict mode
    const strictBuilder = (await import("../src/schema-metadata-builder")).createSchemaBuilder(builder.db, builder.tables, "strict");
    const strictMeta = strictBuilder.build();
    const strictRepo = strictMeta.repoFactory("users", {
      default: { allowedProjections: ["*"] }
    });
    await strictRepo.searchMany({}, "hacker_profile" as any);
    console.error("❌ FAILED: The unvalidated profile did not throw an error.");
  } catch (error: any) {
    if (isSecurityError(error) && error.code === "ACCESS_DENIED") {
      console.log("✅ PASSED: Safely caught AccessDeniedError using isSecurityError utility.");
    } else {
      console.error("❌ FAILED: Threw an unexpected error:", error);
    }
  }

  console.log("\n--- Testing Edge Case: JSON Array Extraction ---");
  const jsonArrayResult = await userRepo.searchOne({
    projection: [
      "name",
      "persona.skills.0",
      "settings.theme",
      "occupational.period.start",
    ],
    filter: {
      "persona.skills.0": { $eq: "java" },
    },
    order: {
      "persona.skills.0": "desc",
    },
  });
  console.log("JSON Array Extraction Result:", JSON.stringify(jsonArrayResult, null, 2));

  console.log("\n--- Testing RBAC Trimming ---");
  const trimmedRepo = builder.repoFactory("users", {
    public: {
      allowedFilters: ["name", "email"],
      allowedProjections: ["name"],
    }
  });

  const trimmedQuery = await trimmedRepo.searchMany({
    projection: ["name", "persona"],
    filter: {
      "name": { $eq: "John" },
      "persona.skills": { $isNull: true }
    }
  } as any, "public");

  console.log("Trimmed Query Executed.");

  console.log("\n--- Playground Test Finished ---");
}
