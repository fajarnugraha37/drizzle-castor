import "bun";
import { faker } from "@faker-js/faker";
import { db, isHasUsersData, listOfProfiles, schemaMetadata } from "./helper";

export async function updateExample(args?: string[]) {
  const userRepo = schemaMetadata.repoFactory("users", {});
  const users = (await isHasUsersData(50)).data;

  for (const profile of listOfProfiles) {
    console.log(
      `--- Testing updateOne for user with  profile ${JSON.stringify(profile)} ---`,
    );

    // update one
    try {
      // pick random user
      const userToUpdate = users[Math.floor(Math.random() * users.length)];
      console.log(
        `[UPDATE] Updating user with id ${userToUpdate.id} and profile ${JSON.stringify(
          {
            name: userToUpdate.name,
            email: userToUpdate.email,
            occupational: userToUpdate.occupational,
            persona: userToUpdate.persona,
          },
        )}`,
      );
      const updateOneResult = await userRepo.updateOne(
        userToUpdate!.id,
        {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          "occupational.company": faker.company.name(),
          persona: {
            hobbies: faker.helpers.arrayElements(
              ["coding", "swimming", "reading", "gaming"],
              2,
            ),
            skills: faker.helpers.arrayElements(
              ["typescript", "javascript", "python", "go"],
              2,
            ),
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[UPDATE][SUCCESS] Updated user with id ${userToUpdate!.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
            id: updateOneResult?.id,
            name: updateOneResult?.name,
            email: updateOneResult?.email,
            occupational: updateOneResult?.occupational,
            persona: updateOneResult?.persona,
        },
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[UPDATE][ERROR] Error updating user with id with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // update many
    try {
      // pick random 5 users
      const usersToUpdate = users.sort(() => 0.5 - Math.random()).slice(0, 5);
      console.log(
        `[UPDATE] Updating users with ids ${usersToUpdate.map((u) => u.id).join(", ")}`,
      );
      const updateManyResult = await userRepo.updateMany(
        {
          $or: [
            { name: { $like: usersToUpdate[0].name } },
            { email: { $eq: usersToUpdate[1].email } },
            { age: { $lte: usersToUpdate[2].age } },
            {
              "occupational.company": {
                $like: usersToUpdate[3].occupational?.company,
              },
            },
            { "persona.hobbies": { $in: usersToUpdate[4].persona?.hobbies } },
            { "persona.skills": { $in: usersToUpdate[0].persona?.skills } },
            { "persona.skills.0": { $like: 'fu%' } },
            { "persona.skills.0": { $ilike: 'Fu%' } },
            { "persona.skills.0": { $notLike: 'zu%' } },
            { "persona.skills.0": { $notIlike: 'Zu%' } },
            { 'profile.avatarUrl': { '$isNull': true } },
          ],
        },
        {
          name: faker.person.fullName(),
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[UPDATE][SUCCESS] Updated many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        updateManyResult.length, updateManyResult.map((u) => u.id).join(", "),
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[UPDATE][ERROR] Error updating many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message, err
      );
    }
  }
}
