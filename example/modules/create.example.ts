import "bun";
import { faker } from "@faker-js/faker";
import { db, listOfProfiles, schemaMetadata } from "./helper";

export async function createExample(args?: string[]) {
  const userRepo = schemaMetadata.repoFactory("users");

  // check create one with multiple profiles
  const ids = [];
  for (const profile of listOfProfiles) {
    // check create one
    console.log(
      `--- Testing createOne for user with profile ${JSON.stringify(profile)} ---`,
    );
    try {
      const createOneResult = await userRepo.createOne(
        {
          name: faker.person.fullName(),
          email: faker.internet.email(),
          age: faker.number.int({ min: 18, max: 60 }),
          persona: {
            hobbies: faker.helpers.arrayElements([
              "coding",
              "swimming",
              "gaming",
            ]),
            skills: faker.helpers.arrayElements([
              "typescript",
              "javascript",
              "python",
            ]),
          },
          settings: {
            theme: faker.helpers.arrayElement(["light", "dark"]),
            notifications: faker.datatype.boolean(),
            occasionally: {
              oldValue: faker.lorem.sentence(),
              randomValue: faker.number.int(),
            },
          },
          occupational: {
            company: faker.company.name(),
            position: faker.person.jobTitle(),
            period: {
              start: faker.date.past(),
              end: faker.date.future(),
            },
          },
        },
        profile as any,
      );
      console.log(
        `\x1b[32m[CREATE][SUCCESS] Created user with profile ${JSON.stringify(profile)}:\x1b[0m`,
        {
          id: createOneResult.id,
          name: createOneResult.name,
          email: createOneResult.email,
          age: createOneResult.age,
          persona: createOneResult.persona,
        },
      );
      ids.push(createOneResult.id);
    } catch (err: any) {
      console.error(
        `\x1b[31m[CREATE][ERROR] Error creating user with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // check create many
    try {
      console.log(
        `--- Testing createMany for users with profile ${JSON.stringify(profile)} ---`,
      );
      const createManyResult = await userRepo.createMany(
        Array.from({ length: 5 }, () => ({
          name: faker.person.fullName(),
          email: faker.internet.email(),
          age: faker.number.int({ min: 18, max: 60 }),
          persona: {
            hobbies: faker.helpers.arrayElements([
              "coding",
              "swimming",
              "gaming",
            ]),
            skills: faker.helpers.arrayElements([
              "typescript",
              "javascript",
              "python",
            ]),
          },
          settings: {
            theme: faker.helpers.arrayElement(["light", "dark"]),
            notifications: faker.datatype.boolean(),
            occasionally: {
              oldValue: faker.lorem.sentence(),
              randomValue: faker.number.int(),
            },
          },
          occupational: {
            company: faker.company.name(),
            position: faker.person.jobTitle(),
            period: {
              start: faker.date.past(),
              end: faker.date.future(),
            },
          },
        })),
        profile as any,
      );
      console.log(
        `\x1b[32m[CREATE][SUCCESS] Created many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        createManyResult.length,
      );
      ids.push(...createManyResult.map((user) => user.id));
    } catch (err: any) {
      console.error(
        `\x1b[31m[CREATE][ERROR] Error creating many users with profile ${JSON.stringify(profile)}:\x1b[0m`,
        err.message,
      );
    }

    // cleanup created users
    try {
      await userRepo.hardDeleteMany(
        {
          id: { $in: ids },
        },
        "admin",
      );
      console.log(
        `\x1b[32m[CREATE][SUCCESS] Deleted user with ids ${ids.join(", ")}\x1b[0m`,
      );
    } catch (err: any) {
      console.error(
        `\x1b[31m[CREATE][ERROR] Error deleting user with ids ${ids.join(", ")}:\x1b[0m`,
        err.message,
      );
    }
  }
}
