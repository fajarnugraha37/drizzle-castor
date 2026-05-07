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

const userRepo = schemaMetadata.repoFactory('books', {
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
})
