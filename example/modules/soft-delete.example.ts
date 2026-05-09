import "bun";
import { db, isHasUsersData, listOfProfiles, schemaMetadata } from "./helper";
import { faker } from "@faker-js/faker";

export async function softDeleteExample(args?: string[]) {
  const userRepo = schemaMetadata.repoFactory("users");
  const users = (await isHasUsersData(50)).data;

  for (const profile of listOfProfiles) {
    // restore semua data
    await userRepo.restoreMany({}, "admin");
    // soft delete one
    // pick one random user
    const userToSoftDelete = users[Math.floor(Math.random() * users.length)];
    console.log(
      `--- Testing soft deleteOne for user with profile ${JSON.stringify(profile)} ---`,
    );
    try {
      const softDeleteOneResult = await userRepo.softDeleteOne(
        userToSoftDelete!.id,
        profile as any,
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Soft deleted user with id ${userToSoftDelete!.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        softDeleteOneResult,
      );

      // get via search deleted
      const getDeleted = await userRepo.searchDeletedOne(
        {
          filter: {
            id: {
              $eq: userToSoftDelete!.id,
            },
          },
        },
        "admin",
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Get soft deleted user with id ${userToSoftDelete!.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
          id: getDeleted?.id,
          name: getDeleted?.name,
          deletedFlag: getDeleted?.deletedFlag,
          deletedAt: getDeleted?.deletedAt,
          deletedBy: getDeleted?.deletedBy,
        },
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[SOFT DELETE][ERROR] Error soft deleting user with id with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // restore one
    try {
      const restoreOneResult = await userRepo.restoreOne(
        userToSoftDelete!.id,
        profile as any,
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Restored user with id ${userToSoftDelete!.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        restoreOneResult,
      );
      const getRestored = await userRepo.searchOne(
        {
          filter: {
            id: {
              $eq: userToSoftDelete!.id,
            },
          },
        },
        "admin",
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Get restored user with id ${userToSoftDelete!.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
          id: getRestored?.id,
          name: getRestored?.name,
          deletedFlag: getRestored?.deletedFlag,
          deletedAt: getRestored?.deletedAt,
          deletedBy: getRestored?.deletedBy,
        },
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[SOFT DELETE][ERROR] Error restoring user with id with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // soft delete many
    // pick random 5 users
    const usersToSoftDelete = users.sort(() => 0.5 - Math.random()).slice(0, 5);
    console.log(
      `--- Testing soft deleteMany for user with profile ${JSON.stringify(profile)} ---`,
    );
    try {
      const softDeleteManyResult = await userRepo.softDeleteMany(
        {
          $or: [
            { name: { $like: usersToSoftDelete[0].name } },
            { email: { $eq: usersToSoftDelete[1].email } },
            { age: { $lte: usersToSoftDelete[2].age } },
            {
              "occupational.company": {
                $like: usersToSoftDelete[3].occupational?.company,
              },
            },
            {
              "persona.hobbies": { $in: usersToSoftDelete[4].persona?.hobbies },
            },
            { "persona.skills": { $in: usersToSoftDelete[0].persona?.skills } },
            { "persona.skills.0": { $like: "fu%" } },
            { "persona.skills.0": { $ilike: "Fu%" } },
            { "persona.skills.0": { $notLike: "zu%" } },
            { "persona.skills.0": { $notIlike: "Zu%" } },
          ],
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Soft deleted many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        softDeleteManyResult,
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[SOFT DELETE][ERROR] Error soft deleting many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
    // restore many
    try {
      const restoreManyResult = await userRepo.restoreMany(
        {
          $or: [
            { name: { $like: usersToSoftDelete[0].name } },
            { email: { $eq: usersToSoftDelete[1].email } },
            { age: { $lte: usersToSoftDelete[2].age } },
            {
              "occupational.company": {
                $like: usersToSoftDelete[3].occupational?.company,
              },
            },
            {
              "persona.hobbies": { $in: usersToSoftDelete[4].persona?.hobbies },
            },
            { "persona.skills": { $in: usersToSoftDelete[0].persona?.skills } },
            { "persona.skills.0": { $like: "fu%" } },
            { "persona.skills.0": { $ilike: "Fu%" } },
            { "persona.skills.0": { $notLike: "zu%" } },
            { "persona.skills.0": { $notIlike: "Zu%" } },
          ],
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[SOFT DELETE][SUCCESS] Restored many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        restoreManyResult,
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[SOFT DELETE][ERROR] Error restoring many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
  }
}
