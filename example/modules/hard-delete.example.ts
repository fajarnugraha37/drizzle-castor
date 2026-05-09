import "bun";
import { db, isHasUsersData, listOfProfiles, schemaMetadata } from "./helper";

export async function hardDeleteExample(args?: string[]) {
  const userRepo = schemaMetadata.repoFactory("users");

  const users = (await isHasUsersData(50)).data;

  const deletedIds = [];
  // list of combination of profiles to test default, public, admin
  for (const profile of listOfProfiles) {
    // delete one
    const userToDelete = users[0];
    console.log(
      `--- Testing hardDeleteOne for user with id ${userToDelete.id} and profile ${JSON.stringify(profile)} ---`,
    );
    try {
      await userRepo.hardDeleteOne(userToDelete!.id, profile as any);
      console.log(
        `\x1b[32m[HARD DELETE][SUCCESS] Deleted user with profile ${JSON.stringify(profile)}\x1b[0m`,
      );
      const deletedUser = users!.shift();
      deletedIds.push(deletedUser?.id);
    } catch (err: any) {
      console.error(
        `\x1b[31m[HARD DELETE][ERROR] Error deleting user with id with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
    // delete many (2)
    try {
      const deletedUserIds = users.slice(0, 2).map((u) => u.id);
      console.log(
        `--- Testing hardDeleteMany for users with ids ${deletedUserIds.join(", ")} and profile ${JSON.stringify(profile)} ---`,
      );
      const deleteManyResult = await userRepo.hardDeleteMany(
        {
          $or: [{ id: { $in: deletedUserIds } }],
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[HARD DELETE][SUCCESS] Deleted many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        deleteManyResult,
      );
      deletedIds.push(...deletedUserIds);
      users.splice(0, 2);
    } catch (err: any) {
      console.error(
        `\x1b[31m[HARD DELETE][ERROR] Error deleting many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
  }
}
