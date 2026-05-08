import "bun";
import { schemaMetadata } from "./helper";

export async function playground() {
  const userRepo = schemaMetadata.repoFactory("users", {
    default: {
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
    },
    admin: {
      allowedProjections: ["*"],
      allowedFilters: ["*"],
      allowedUpdates: ["*"],
    },
  });

  const users = await userRepo.searchOne({
    order: {
      age: "desc",
    },
  });
  console.log("User with highest age:", users);

  console.log("\n--- Testing BUG-1: Prototype Pollution ---");
  try {
    // Attempting to project __proto__.polluted
    await userRepo.searchOne(
      {
        projection: ["persona.__proto__.polluted"] as any,
      },
      "admin",
    );
    console.error(
      "❌ FAIL: BUG-1 is NOT fixed. Projection of __proto__ passed validation.",
    );
  } catch (error: any) {
    if (error.message.includes("Security Error")) {
      console.log(
        "✅ PASS: BUG-1 is fixed. Caught illegal prototype key in projection with message:",
        error.message,
      );
    } else {
      console.error("❌ FAIL: Unexpected error occurred:", error.message);
    }
  }

  // Test Hydrator Prototype Pollution directly
  const { hydrateResults } = require("../src/query-parser/hydrator");
  try {
    const maliciousRow = { users: { "persona.__proto__.polluted": "yes" } };
    hydrateResults([maliciousRow], "users", schemaMetadata.metadata);
    // If it reaches here without error, check if Object.prototype is polluted
    if ((Object.prototype as any).polluted === "yes") {
      console.error(
        "❌ FAIL: BUG-1 is NOT fixed. Object.prototype was polluted!",
      );
      delete (Object.prototype as any).polluted; // cleanup
    } else {
      console.log(
        "✅ PASS: BUG-1 is fixed. Hydrator did not pollute Object.prototype (but didn't throw?).",
      );
    }
  } catch (error: any) {
    if (error.message.includes("Security Error")) {
      console.log(
        "✅ PASS: BUG-1 is fixed. Hydrator caught illegal prototype key with message:",
        error.message,
      );
    } else {
      console.error("❌ FAIL: Hydrator unexpected error:", error.message);
    }
  }
  console.log("--------------------------------------------------\n");
  try {
    const res = await userRepo.updateMany(
      { "posts.title": { $eq: "My Post" } } as any,
      { name: "Updated" },
      "admin",
    );
    console.log(
      "✅ PASS: BUG-4 did not cause Ambiguous column on One-to-Many. Result:",
      res,
    );
  } catch (error: any) {
    console.error(
      "❌ FAIL: BUG-4 caused an error on One-to-Many:",
      error.message,
    );
  }

  const groupRepo = schemaMetadata.repoFactory("groups", {
    admin: {
      allowedProjections: ["*"],
      allowedFilters: ["*"],
      allowedUpdates: ["*"],
    },
  });

  try {
    const res2 = await groupRepo.updateMany(
      { "users.name": { $eq: "Updated" } } as any,
      { name: "Updated Group" },
      "admin",
    );
    console.log(
      "✅ PASS: BUG-4 did not cause Ambiguous column on Many-to-Many. Result:",
      res2,
    );
  } catch (error: any) {
    console.error(
      "❌ FAIL: BUG-4 caused an error on Many-to-Many:",
      error.message,
    );
  }
  console.log("--------------------------------------------------\n");
  try {
    // Attempting to update a prototype property, which should be rejected
    await userRepo.updateOne(
      users!.id,
      { "toString.path": "hacked" } as any,
      "admin",
    );
    console.error(
      "❌ FAIL: BUG-3 is NOT fixed. Query passed validation and executed.",
    );
  } catch (error: any) {
    if (error.message.includes("Column 'toString' not found")) {
      console.log(
        "✅ PASS: BUG-3 is fixed. Caught invalid column successfully with message:",
        error.message,
      );
    } else {
      console.error("❌ FAIL: Unexpected error occurred:", error.message);
    }
  }
  console.log("--------------------------------------------------\n");

  // // 1. Check data from database (seeded with numeric strings)
  // const users = await userRepo.searchPage({
  //   pageSize: 5,
  // }, "admin");

  // console.log("\n[Test 1] Verifying seeded numeric strings in users table:");
  // users.data.forEach(user => {
  //   const zipType = typeof user.zipCode;
  //   const sidType = typeof user.stringId;

  //   console.log(`User ID: ${user.id}`);
  //   console.log(` - zipCode: "${user.zipCode}" (type: ${zipType}) -> ${zipType === 'string' ? '✅ PASS' : '❌ FAIL'}`);
  //   console.log(` - stringId: "${user.stringId}" (type: ${sidType}) -> ${sidType === 'string' ? '✅ PASS' : '❌ FAIL'}`);
  // });

  // // 2. Deep Edge Case Test (Manual Data Simulation)
  // // We simulate what Drizzle returns from SQLite for JSON columns or dot-notation fields
  // console.log("\n[Test 2] Manual Hydration Edge Cases:");

  // // We'll use the repo's internal hydrator indirectly by searching with custom filters
  // // or just mocking a raw row if we could access the hydrator.
  // // Since we want to be thorough, let's create a temporary user with specific "dangerous" values.

  // const dangerousUser = await userRepo.createOne({
  //   name: "Edge Case User",
  //   email: `edge.${Date.now()}@test.com`,
  //   zipCode: "00123",        // Numeric string with leading zero
  //   stringId: "true",        // Boolean-like string
  //   occupational: {
  //     position: "false",    // Nested boolean-like string
  //     company: "Test Inc",
  //     period: { start: new Date(), end: new Date() }
  //   },
  //   persona: {
  //     hobbies: ["coding"],
  //     skills: ["null", "123", "{\"nested\": \"ok\"}"] as any, // Mixed array
  //   },
  // }, "admin");

  // const fetched = await userRepo.searchOne({
  //   filter: { id: { $eq: dangerousUser.id } }
  // }, "admin");

  // if (fetched) {
  //   console.log("Checking Dangerous User Results:");

  //   const checks = [
  //     { label: "Leading zero string (00123)", value: fetched.zipCode, expected: "string" },
  //     { label: "Boolean string (true)", value: fetched.stringId, expected: "string" },
  //     { label: "Nested boolean string (false)", value: fetched.occupational?.position, expected: "string" },
  //     { label: "Array element 'null'", value: fetched.persona?.skills?.[0], expected: "string" },
  //     { label: "Array element '123'", value: fetched.persona?.skills?.[1], expected: "string" },
  //     { label: "Array element '{\"nested\": \"ok\"}' (Should remain string)", value: fetched.persona?.skills?.[2], expected: "string" },
  //     { label: "Whole JSON Object (persona)", value: fetched.persona, expected: "object" },
  //   ];

  //   checks.forEach(c => {
  //     const actualType = typeof c.value;
  //     const pass = actualType === c.expected;
  //     console.log(` - ${c.label}: "${JSON.stringify(c.value)}" (type: ${actualType}) -> ${pass ? '✅ PASS' : '❌ FAIL'}`);
  //   });
  // }

  // // Cleanup
  // await userRepo.hardDeleteOne(dangerousUser.id, "admin");

  // // 3. BUG-1 (SQL Injection) Security Check
  // console.log("\n[Test 3] BUG-1 (SQL Injection) Security Check:");

  // const injectionVectors = [
  //   {
  //     label: "Classic Breakout",
  //     key: "profile.bio'), '$.x', 'y'); DROP TABLE users; --"
  //   },
  //   {
  //     label: "Comment Injection",
  //     key: "settings.theme' --"
  //   },
  //   {
  //     label: "Function Call",
  //     key: "occupational.position[0].(SELECT 'secret')"
  //   },
  //   {
  //     label: "Invalid Symbol",
  //     key: "persona.skills!"
  //   }
  // ];

  // for (const vector of injectionVectors) {
  //   try {
  //     // Note: We use any here because TypeScript would block these keys if we had strict types,
  //     // but in a real-world API scenario, these arrive as untyped JSON.
  //     await userRepo.updateOne(1, { [vector.key]: "hacker" } as any, "admin");
  //     console.log(`❌ FAIL: ${vector.label} reached the database!`);
  //   } catch (e: any) {
  //     const isSecurityError = e.message.includes("Security Error");
  //     console.log(`✅ PASS: ${vector.label} blocked. ${isSecurityError ? '(Type: Security Error)' : '(Type: Other Error)'}`);
  //   }
  // }

  // // Ensure valid paths still work
  // try {
  //   const validKey = "occupational.position";
  //   await userRepo.updateOne(1, { [validKey]: "Developer" } as any, "admin");
  //   console.log("✅ PASS: Valid nested path works normally.");
  // } catch (e: any) {
  //   console.log(`❌ FAIL: Valid path was blocked: ${e.message}`);
  // }

  // // 4. BUG-3 (Nested Join Logic) Check
  // console.log("\n[Test 4] BUG-3 (Nested Join Logic) Check:");
  // const groupRepo = schemaMetadata.repoFactory("groups", {});

  // try {
  //   // 3 Levels deep: groups -> users -> posts -> comments
  //   const results = await groupRepo.searchMany({
  //     limit: 1,
  //     projection: [
  //       "name",
  //       "users.name",
  //       "users.posts.title",
  //       "users.posts.comments.content"
  //     ],
  //   }, "admin");

  //   console.log(`✅ PASS: Successfully executed 3-level deep nested join.`);
  //   if (results.length > 0) {
  //     const group = results[0];
  //     const user = group.users?.[0];
  //     const post = user?.posts?.[0];
  //     const comment = post?.comments?.[0];

  //     console.log(`Structure Check:`);
  //     console.log(` - Group: ${group.name}`);
  //     console.log(` - User: ${user?.name || 'N/A'}`);
  //     console.log(` - Post: ${post?.title ? 'Exists' : 'N/A'}`);
  //     console.log(` - Comment: ${comment?.content ? 'Exists' : 'N/A'}`);
  //   }
  // } catch (e: any) {
  //   console.log(`❌ FAIL: Nested join failed. Error: ${e.message}`);
  // }

  // // 5. Level 5 Stress Test
  // console.log("\n[Test 5] 5-Level Deep Nested Join Check:");
  // try {
  //   // Chain: Groups -> Users -> Posts -> Comments -> Author (User) -> Profile
  //   const deepResults = await groupRepo.searchMany({
  //     limit: 1,
  //     projection: [
  //       "name",
  //       "users.name",
  //       "users.posts.title",
  //       "users.posts.comments.content",
  //       "users.posts.comments.author.name",
  //       "users.posts.comments.author.profile.bio"
  //     ],
  //     order: {
  //       'users.posts.comments.createdAt': {
  //         'aggregate': 'avg',
  //         direction: 'desc',
  //         'nulls': 'first'
  //       }
  //     }
  //   }, "admin");

  //   console.log(`✅ PASS: Successfully executed 5-level deep nested join.`);
  //   if (deepResults.length > 0) {
  //     const group = deepResults[0];
  //     const comment = group.users?.[0]?.posts?.[0]?.comments?.[0];
  //     const author = comment?.author;
  //     const profile = author?.profile;

  //     console.log(`Deep Structure Check:`);
  //     console.log(` - Group: ${group.name}`);
  //     console.log(` - Comment Author: ${author?.name || 'N/A'}`);
  //     console.log(` - Author Profile Bio: ${profile?.bio ? 'Exists' : 'N/A'}`);
  //   }
  // } catch (e: any) {
  //   console.log(`❌ FAIL: 5-level nested join failed. Error: ${e.message}`);
  // }

  console.log("\n--- Playground Test Finished ---");
}
