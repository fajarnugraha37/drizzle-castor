import "bun";
import { db, isHasUsersData, listOfProfiles, schemaMetadata } from "./helper";

export async function readExample(args?: string[]) {
  const userRepo = schemaMetadata.repoFactory("users", {});
  const users = (await isHasUsersData(50)).data;

  for (const profile of listOfProfiles) {
    console.log(
      `--- Testing readOne for user with  profile ${JSON.stringify(profile)} ---`,
    );
    // search one
    try {
      // pick random user
      const userToRead = users[Math.floor(Math.random() * users.length)];
      const readOneResult = await userRepo.searchOne(
        { filter: { id: { $eq: userToRead.id } } },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read user with id ${userToRead.id} and profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
          id: readOneResult?.id,
          name: readOneResult?.name,
          email: readOneResult?.email,
          deletedFlag: readOneResult?.deletedFlag,
          deletedAt: readOneResult?.deletedAt,
          deletedBy: readOneResult?.deletedBy,
        },
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading user with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
    // search many
    try {
      // randomly pick 5 users
      const usersToRead = users.sort(() => 0.5 - Math.random()).slice(0, 5);
      const readManyResult = await userRepo.searchMany(
        {
          filter: {
            $or: [
              { name: { $like: usersToRead[0].name } },
              { email: { $eq: usersToRead[1].email } },
              { age: { $lte: usersToRead[2].age } },
              {
                "occupational.company": {
                  $like: usersToRead[3].occupational?.company,
                },
              },
              { "persona.hobbies": { $in: usersToRead[4].persona?.hobbies } },
              { "persona.skills": { $in: usersToRead[0].persona?.skills } },
              { "persona.skills.0": { $like: "fu%" } },
              { "persona.skills.0": { $ilike: "Fu%" } },
              { "persona.skills.0": { $notLike: "zu%" } },
              { "persona.skills.0": { $notIlike: "Zu%" } },
            ],
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        readManyResult.length,
        // readManyResult.map((u) => ({
        //   id: u.id,
        //   deletedFlag: u.deletedFlag,
        //   deletedAt: u.deletedAt,
        //   deletedBy: u.deletedBy,
        // })),
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }
    // search page
    try {
      const pageResult = await userRepo.searchPage(
        {
          filter: {
            age: { $gte: 18 },
          },
          page: 2,
          pageSize: 3,
          order: {
            name: "desc",
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read page of users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        pageResult.data.length,
        // pageResult.data.map((u) => ({
        //   id: u.id,
        //   deletedFlag: u.deletedFlag,
        //   deletedAt: u.deletedAt,
        //   deletedBy: u.deletedBy,
        // })),
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading page of users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // search deleted page
    try {
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading deleted page of users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // soft delete all users first
    await userRepo.softDeleteMany(
      {
        id: { $in: users.map((u) => u.id) },
      },
      "admin",
    );

    // randomly pick 5 users
    const usersToReadDeleted = users
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);
    try {
      // search deleted many
      const readDeletedManyResult = await userRepo.searchDeletedMany(
        {
          filter: {
            $or: [
              { name: { $like: usersToReadDeleted[0].name } },
              { email: { $eq: usersToReadDeleted[1].email } },
              { age: { $lte: usersToReadDeleted[2].age } },
              {
                "occupational.company": {
                  $like: usersToReadDeleted[3].occupational?.company,
                },
              },
              {
                "persona.hobbies": {
                  $in: usersToReadDeleted[4].persona?.hobbies,
                },
              },
              {
                "persona.skills": {
                  $in: usersToReadDeleted[0].persona?.skills,
                },
              },
              { "persona.skills.0": { $like: "fu%" } },
              { "persona.skills.0": { $ilike: "Fu%" } },
              { "persona.skills.0": { $notLike: "zu%" } },
              { "persona.skills.0": { $notIlike: "Zu%" } },
            ],
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read deleted many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        readDeletedManyResult.length,
        // readDeletedManyResult.map((u) => ({
        //   id: u.id,
        //   deletedFlag: u.deletedFlag,
        //   deletedAt: u.deletedAt,
        //   deletedBy: u.deletedBy,
        // })),
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading deleted many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // search delete page
    try {
      const readDeletedPageResult = await userRepo.searchDeletedPage(
        {
          filter: {
            age: { $gte: 18 },
          },
          page: 2,
          pageSize: 3,
          order: {
            name: "desc",
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read deleted page of users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        readDeletedPageResult.data.length,
        // readDeletedPageResult.data.map((u) => ({
        //   id: u.id,
        //   deletedFlag: u.deletedFlag,
        //   deletedAt: u.deletedAt,
        //   deletedBy: u.deletedBy,
        // })),
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading deleted page of users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // search deleted one
    try {
      const readDeletedOneResult = await userRepo.searchDeletedOne(
        {
          filter: {
            id: { $in: users.map((u) => u.id) },
          },
          order: {
            age: {
              direction: 'desc',
              nulls: 'last',
              aggregate: 'max',
            }
          }
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[READ][SUCCESS] Read deleted user with profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
          id: readDeletedOneResult?.id,
          deletedFlag: readDeletedOneResult?.deletedFlag,
          deletedAt: readDeletedOneResult?.deletedAt,
          deletedBy: readDeletedOneResult?.deletedBy,
        },
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[READ][ERROR] Error reading deleted user with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // restore all users
    await userRepo.restoreMany(
      {
        $or: [
          { id: { $in: users.map((u) => u.id) } },
          { 'profile.avatarUrl': { '$isNull': true } },
        ],
      },
      "admin",
    );
  }
}
