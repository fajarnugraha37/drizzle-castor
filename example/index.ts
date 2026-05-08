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

import { schemaMetadata } from "./helper";

async function playground() {
  console.log("--- BUG-2 Verification Playground ---");
  const userRepo = schemaMetadata.repoFactory("users", {});

  // 1. Check data from database (seeded with numeric strings)
  const users = await userRepo.searchPage({
    pageSize: 5,
  }, "admin");

  console.log("\n[Test 1] Verifying seeded numeric strings in users table:");
  users.data.forEach(user => {
    const zipType = typeof user.zipCode;
    const sidType = typeof user.stringId;
    
    console.log(`User ID: ${user.id}`);
    console.log(` - zipCode: "${user.zipCode}" (type: ${zipType}) -> ${zipType === 'string' ? '✅ PASS' : '❌ FAIL'}`);
    console.log(` - stringId: "${user.stringId}" (type: ${sidType}) -> ${sidType === 'string' ? '✅ PASS' : '❌ FAIL'}`);
  });

  // 2. Deep Edge Case Test (Manual Data Simulation)
  // We simulate what Drizzle returns from SQLite for JSON columns or dot-notation fields
  console.log("\n[Test 2] Manual Hydration Edge Cases:");
  
  // We'll use the repo's internal hydrator indirectly by searching with custom filters 
  // or just mocking a raw row if we could access the hydrator.
  // Since we want to be thorough, let's create a temporary user with specific "dangerous" values.
  
  const dangerousUser = await userRepo.createOne({
    name: "Edge Case User",
    email: `edge.${Date.now()}@test.com`,
    zipCode: "00123",        // Numeric string with leading zero
    stringId: "true",        // Boolean-like string
    occupational: {
      position: "false",    // Nested boolean-like string
      company: "Test Inc",
      period: { start: new Date(), end: new Date() }
    },
    persona: {
      hobbies: ["coding"],
      skills: ["null", "123", "{\"nested\": \"ok\"}"] as any, // Mixed array
    },
  }, "admin");

  const fetched = await userRepo.searchOne({
    filter: { id: { $eq: dangerousUser.id } }
  }, "admin");

  if (fetched) {
    console.log("Checking Dangerous User Results:");
    
    const checks = [
      { label: "Leading zero string (00123)", value: fetched.zipCode, expected: "string" },
      { label: "Boolean string (true)", value: fetched.stringId, expected: "string" },
      { label: "Nested boolean string (false)", value: fetched.occupational?.position, expected: "string" },
      { label: "Array element 'null'", value: fetched.persona?.skills?.[0], expected: "string" },
      { label: "Array element '123'", value: fetched.persona?.skills?.[1], expected: "string" },
      { label: "Array element '{\"nested\": \"ok\"}' (Should remain string)", value: fetched.persona?.skills?.[2], expected: "string" },
      { label: "Whole JSON Object (persona)", value: fetched.persona, expected: "object" },
    ];

    checks.forEach(c => {
      const actualType = typeof c.value;
      const pass = actualType === c.expected;
      console.log(` - ${c.label}: "${JSON.stringify(c.value)}" (type: ${actualType}) -> ${pass ? '✅ PASS' : '❌ FAIL'}`);
    });
  }

  // Cleanup
  await userRepo.hardDeleteOne(dangerousUser.id, "admin");
  console.log("\n--- Playground Test Finished ---");
}