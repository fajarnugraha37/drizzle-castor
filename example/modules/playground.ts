import "bun";
import { schemaMetadata } from "./helper";

export async function playground() {
  const userRepo = schemaMetadata.repoFactory("users");

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
  const { hydrateResults } = require("../../src/query-parser/hydrator");
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

  const groupRepo = schemaMetadata.repoFactory("groups");

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

  console.log("\n--- [EDGE CASE] Testing Global Policy & Telemetry ---");
  
  // 1. Subscribe to all telemetry events for verification
  const eventsCaptured: string[] = [];
  schemaMetadata.subscribeToTelemetry((ctx) => {
    // Legacy telemetry test
    eventsCaptured.push(`legacy:${ctx.action}`);
  });

  // Access the builder from helper to register 'mitt' events
  const { schemaMetadataBuilder } = require("./helper");
  
  schemaMetadataBuilder.on("execution", (ev: any) => {
    console.log(`[Telemetry Event] Execution: ${ev.action} on ${ev.tableName} status: ${ev.status} (${ev.duration.toFixed(2)}ms)`);
    eventsCaptured.push(`mitt:execution:${ev.action}`);
  });

  schemaMetadataBuilder.on("security", (ev: any) => {
    console.log(`[Telemetry Event] Security: ${ev.type} on ${ev.tableName} - ${ev.message}`);
    eventsCaptured.push(`mitt:security:${ev.type}`);
  });

  schemaMetadataBuilder.on("soft-deleted", (ev: any) => {
    console.log(`[Telemetry Event] Mutation: ${ev.action} on ${ev.tableName} - Records: ${ev.records.length}`);
    eventsCaptured.push(`mitt:mutation:${ev.action}`);
  });

  // 2. Test RBAC Trimming via Telemetry
  console.log("\n[Sub-Test] Triggering RBAC Field Trimming...");
  // Use 'public' profile which is configured in helper.ts to only allow 'name' projection
  try {
    await userRepo.searchMany({
      projection: ["id", "name", "email", "secret_field"] as any,
    }, "public");
  } catch (e: any) {
    console.log(`[Info] Trimming resulted in: ${e.message}`);
  }

  // 3. Test Mutation Events (Soft Delete)
  console.log("\n[Sub-Test] Triggering Mutation Events...");
  try {
    const tempUser = await userRepo.createOne({
      name: "Telemetry Test",
      email: `telemetry.${Date.now()}@example.com`,
    }, "admin");
    
    await userRepo.softDeleteOne(tempUser.id, "admin");
    await userRepo.restoreOne(tempUser.id, "admin");
    await userRepo.hardDeleteOne(tempUser.id, "admin");
  } catch (e: any) {
    console.error(`[Error] Mutation tests failed: ${e.message}`);
  }

  // 4. Test Global Policy Fallback
  console.log("\n[Sub-Test] Testing Global Policy Fallback...");
  const postRepo = schemaMetadata.repoFactory("posts");
  // Posts doesn't have a specific policy in helper.ts, so it should hit the global fallback
  
  try {
    await postRepo.searchOne({}, "guest");
    console.log("✅ PASS: Global Policy handled guest access to posts.");
  } catch (e: any) {
    console.log(`❌ FAIL: Global Policy failed for posts (guest): ${e.message}`);
  }

  // Final Verification
  await new Promise(resolve => setTimeout(resolve, 200)); // Wait for async telemetry
  console.log("\nSummary of Captured Events:");
  eventsCaptured.forEach(e => console.log(` - ${e}`));

  if (eventsCaptured.some(e => e.includes("mitt:security:field_trim"))) {
    console.log("\n✅ FINAL PASS: Telemetry system accurately captured security events.");
  } else {
    console.error("\n❌ FINAL FAIL: Telemetry system missed security events.");
  }

  console.log("\n--- Playground Test Finished ---");
}
