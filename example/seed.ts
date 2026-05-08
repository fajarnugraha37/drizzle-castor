import { faker } from "@faker-js/faker";
import {
  companiesTable,
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  groupsTable,
  userGroups,
} from "./schema";
import { db } from "./helper";

export async function seed(args?: string[]) {
  await db.delete(companiesTable).execute();
  await db.delete(profilesTable).execute();
  await db.delete(userGroups).execute();
  await db.delete(groupsTable).execute();
  await db.delete(usersTable).execute();
  await db.delete(commentsTable).execute();
  await db.delete(postsTable).execute();

  const companiesCount = await db.$count(companiesTable);
  console.log(`Companies count: ${companiesCount}`);
  if (companiesCount === 0) {
    for (let i = 1; i <= 25; i++) {
      await db.insert(companiesTable).values({
        name: faker.company.name(),
      });
    }
  }
  const companies = await db.select().from(companiesTable);
  console.log(`Inserted ${companies.length} companies`);

  const groupsCount = await db.$count(groupsTable);
  console.log(`Groups count: ${groupsCount}`);
  if (groupsCount === 0) {
    for (let i = 1; i <= 25; i++) {
      await db.insert(groupsTable).values({
        name: faker.helpers.arrayElement([
          "Admin",
          "Editor",
          "Viewer",
          "Guest",
          "Moderator",
        ]),
      });
    }
  }
  const groups = await db.select().from(groupsTable);
  console.log(`Inserted ${groups.length} groups`);

  const usersCount = await db.$count(usersTable);
  console.log(`Users count: ${usersCount}`);
  if (usersCount === 0) {
    for (let i = 1; i <= 500; i++) {
      const randomCompany =
        companies[Math.floor(Math.random() * companies.length)];
      const randomGroups = groups[Math.floor(Math.random() * groups.length)];
      const user = db
        .insert(usersTable)
        .values({
          name: faker.person.fullName(),
          email: faker.internet.email(),
          age: faker.number.int({ min: 18, max: 80 }),
          tags: faker.helpers.arrayElements(
            ["admin", "editor", "viewer"],
            faker.number.int({ min: 1, max: 3 }),
          ),
          persona: {
            hobbies: faker.helpers.arrayElements(
              ["reading", "gaming", "traveling", "cooking"],
              faker.number.int({ min: 1, max: 4 }),
            ),
            skills: faker.helpers.arrayElements(
              ["JavaScript", "TypeScript", "Python", "SQL"],
              faker.number.int({ min: 1, max: 4 }),
            ),
          },
          companyId: randomCompany.id,
          zipCode: faker.location.zipCode(),
          stringId: faker.string.numeric(5),
        })
        .returning()
        .get();

      await db.insert(profilesTable).values({
        userId: user.id,
        bio: faker.lorem.sentence(),
        avatarUrl: faker.image.avatar(),
      });

      await db.insert(userGroups).values({
        userId: user.id,
        groupId: randomGroups.id,
      });
    }
  }
  const users = await db.select().from(usersTable);
  console.log(`Inserted ${users.length} users`);

  const postsCount = await db.$count(postsTable);
  console.log(`Posts count: ${postsCount}`);
  if (postsCount === 0) {
    for (let i = 1; i <= 1000; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const post = db
        .insert(postsTable)
        .values({
          title: faker.lorem.sentence(),
          userId: randomUser.id,
        })
        .returning()
        .get();

      const commentsCount = faker.number.int({ min: 1, max: 5 });
      for (let j = 1; j <= commentsCount; j++) {
        await db.insert(commentsTable).values({
          content: faker.lorem.sentence(),
          postId: post.id,
        });
      }
    }
  }
}
