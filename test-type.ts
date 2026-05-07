import { defineSchemaMetadata } from './src/index';
import { usersTable, profilesTable } from './example/schema';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const db = drizzle(new Database());
const tables = [usersTable, profilesTable] as const;
const schema = defineSchemaMetadata(db, tables)({
  users: {}
});

type Repo = ReturnType<typeof schema.repoFactory<'users', {}>>;
type F = Parameters<Repo['searchMany']>;

type Q = NonNullable<F[0]>['filter'];

// Check if persona.hobbies is allowed
const query: Q = {
  "persona.hobbies": { $arrayContains: ["football"] }
};

// Intentionally cause error to see allowed keys
const query2: Q = {
  "invalid_key": { $eq: "invalid" }
};
