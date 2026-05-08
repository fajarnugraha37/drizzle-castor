import "bun";
import  "../";
import { seed } from "./seed";
import { createExample } from "./modules/create.example";
import { updateExample } from "./modules/update.example";
import { readExample } from "./modules/read.example";
import { hardDeleteExample } from "./modules/hard-delete.example";
import { softDeleteExample } from "./modules/soft-delete.example";

{
  const command = process.argv[2];
  const subCommand = process.argv[3];
  console.log("Received command:", command, "with subcommand:", subCommand);

  switch (command) {
    case "--seed":
      console.log("> Seeding database...");
      await seed(process.argv.splice(2));
      break;
    case "--main":
      switch (subCommand) {
        case "-c":
        case "--create":
          console.log("> Running main function with create subcommand...");
          await createExample(process.argv.splice(3));
          break;
        case "-r":
        case "--read":
          console.log("> Running main function with read subcommand...");
          await readExample(process.argv.splice(3));
          break;
        case "-u":
        case "--update":
          console.log("> Running main function with update subcommand...");
          await updateExample(process.argv.splice(3));
          break;
        case "-sd":
        case "--soft-delete":
          console.log("> Running main function with soft-delete subcommand...");
          await softDeleteExample(process.argv.splice(3));
          break;
        case "-hd":
        case "--hard-delete":
          console.log("> Running main function with hard-delete subcommand...");
          await hardDeleteExample(process.argv.splice(3));
          break;
        case "-p":
        case "--playground":
          console.log("> Running main function with playground subcommand...");
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
  // You can add any ad-hoc testing code here to quickly test things out without affecting the main example functions.
  // For instance, you could directly call repository methods, test out new query patterns, etc.
  // This is a great place for quick experiments and debugging.
}