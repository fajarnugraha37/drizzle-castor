import "bun";
import { seed } from "./modules/seed";
import { schemaMetadata } from "./modules/helper";
import { createExample } from "./modules/create.example";
import { updateExample } from "./modules/update.example";
import { readExample } from "./modules/read.example";
import { hardDeleteExample } from "./modules/hard-delete.example";
import { softDeleteExample } from "./modules/soft-delete.example";

{
  const [, , command, subCommand, ...args] = process.argv;
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
  const userRepo = schemaMetadata.repoFactory("users", {
    default: {
      allowedProjections: ["*"],
      allowedFilters: ["*"],
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

  console.log("\n--- Playground Test Finished ---");
}
