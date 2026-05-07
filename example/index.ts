import { drizzle } from "drizzle-orm/bun-sqlite";
import { books, companies, groups, posts, profiles, userGroups, users } from "./schema";
import { defineSchemaMetadata } from "../src/index";

const db = drizzle("db.sqlite");

const schemaMetadata = defineSchemaMetadata(db, [
  users,
  profiles,
  books,
  companies,
  groups,
  userGroups,
  posts,
] as const)({
  users: {
    hooks: {
      beforeCreate: async (v) => {
        console.log("Before creating user:", v);
      },
      afterCreate: async (v) => {
        console.log("After creating user:", v);
      }
    },
    profiles: {
      'asdasd': ['create', 'read'],
      'asdasd2': ['read']
    },
  },
  books: {
  }
});

const userRepo = schemaMetadata.repoFactory('users', {
    'asdasd': {
    },
    'asdasd2': {
    },
    'asdassssd': {
      'allowedFilters': ['*'],
      'allowedSorts': ['*'],
      'allowedProjections': ['*'],
    }
    // 'asdasd2': {
    //     'allowedFilters': ['id', 'name'],
    //     'allowedSorts': ['id', 'name'],
    //     'allowedProjections': ['id', 'name'],
    // }
});

userRepo.createOne({
  email: "user@example.com",
  name: "John Doe",
  age: 30,
  'tags': ['tag1', 'tag2'],
  'persona': {
    hobbies: ['hobby1', 'hobby2'],
    skills: ['skill1', 'skill2'],
  }
})

userRepo.searchMany({
  filter: {
  },
  order: {
    name: 'asc',
  },
  projection: ['id', 'name', 'tags', 'persona'],
});