import "bun";
import { seed } from "./modules/seed";
import { schemaMetadata } from "./modules/helper";
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
  console.log("--- BUG-2 Verification Playground ---");
  // FIXED: Usage now follows RepoProfileConfig object structure
  const userRepo = schemaMetadata.repoFactory("users", {
    'default': {
      allowedProjections: ['id', 'name', 'email', 'age', 'zipCode', 'stringId', 'persona', 'occupational', 'settings']
    },
    'admin': {
      allowedProjections: ["*"]
    },
  });

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

  // 3. BUG-1 (SQL Injection) Security Check
  console.log("\n[Test 3] BUG-1 (SQL Injection) Security Check:");
  
  const injectionVectors = [
    { 
      label: "Classic Breakout", 
      key: "profile.bio'), '$.x', 'y'); DROP TABLE users; --" 
    },
    { 
      label: "Comment Injection", 
      key: "settings.theme' --" 
    },
    { 
      label: "Function Call", 
      key: "occupational.position[0].(SELECT 'secret')" 
    },
    { 
      label: "Invalid Symbol", 
      key: "persona.skills!" 
    }
  ];

  for (const vector of injectionVectors) {
    try {
      // Note: We use any here because TypeScript would block these keys if we had strict types,
      // but in a real-world API scenario, these arrive as untyped JSON.
      await userRepo.updateOne(1, { [vector.key]: "hacker" } as any, "admin");
      console.log(`❌ FAIL: ${vector.label} reached the database!`);
    } catch (e: any) {
      const isSecurityError = e.message.includes("Security Error");
      console.log(`✅ PASS: ${vector.label} blocked. ${isSecurityError ? '(Type: Security Error)' : '(Type: Other Error)'}`);
    }
  }

  // Ensure valid paths still work
  try {
    const validKey = "occupational.position";
    await userRepo.updateOne(1, { [validKey]: "Developer" } as any, "admin");
    console.log("✅ PASS: Valid nested path works normally.");
  } catch (e: any) {
    console.log(`❌ FAIL: Valid path was blocked: ${e.message}`);
  }

  // 4. BUG-3 (Nested Join Logic) Check
  console.log("\n[Test 4] BUG-3 (Nested Join Logic) Check:");
  const groupRepo = schemaMetadata.repoFactory("groups", {});

  try {
    // 3 Levels deep: groups -> users -> posts -> comments
    const results = await groupRepo.searchMany({
      limit: 1,
      projection: [
        "name",
        "users.name",
        "users.posts.title",
        "users.posts.comments.content"
      ],
    }, "admin");

    console.log(`✅ PASS: Successfully executed 3-level deep nested join.`);
    if (results.length > 0) {
      const group = results[0];
      const user = group.users?.[0];
      const post = user?.posts?.[0];
      const comment = post?.comments?.[0];
      
      console.log(`Structure Check:`);
      console.log(` - Group: ${group.name}`);
      console.log(` - User: ${user?.name || 'N/A'}`);
      console.log(` - Post: ${post?.title ? 'Exists' : 'N/A'}`);
      console.log(` - Comment: ${comment?.content ? 'Exists' : 'N/A'}`);
    }
  } catch (e: any) {
    console.log(`❌ FAIL: Nested join failed. Error: ${e.message}`);
  }

  // 5. Level 5 Stress Test
  console.log("\n[Test 5] 5-Level Deep Nested Join Check:");
  try {
    // Chain: Groups -> Users -> Posts -> Comments -> Author (User) -> Profile
    const deepResults = await groupRepo.searchMany({
      limit: 1,
      projection: [
        "name",
        "users.name",
        "users.posts.title",
        "users.posts.comments.content",
        "users.posts.comments.author.name",
        "users.posts.comments.author.profile.bio"
      ],
      order: {
        'users.posts.comments.createdAt': {
          'aggregate': 'avg',
          direction: 'desc',
          'nulls': 'first'
        }
      }
    }, "admin");

    console.log(`✅ PASS: Successfully executed 5-level deep nested join.`);
    if (deepResults.length > 0) {
      const group = deepResults[0];
      const comment = group.users?.[0]?.posts?.[0]?.comments?.[0];
      const author = comment?.author;
      const profile = author?.profile;

      console.log(`Deep Structure Check:`);
      console.log(` - Group: ${group.name}`);
      console.log(` - Comment Author: ${author?.name || 'N/A'}`);
      console.log(` - Author Profile Bio: ${profile?.bio ? 'Exists' : 'N/A'}`);
    }
  } catch (e: any) {
    console.log(`❌ FAIL: 5-level nested join failed. Error: ${e.message}`);
  }

  console.log("\n--- Playground Test Finished ---");
}