import { createSchemaBuilder } from "./src/index";
import type { InferEntity, TSchemaContext, ValueAt } from "./src/index";
import {
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  companiesTable,
  groupsTable,
  userGroups,
} from "./example/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";

const db = drizzle(new Database());
const tables = [
  companiesTable,
  usersTable,
  profilesTable,
  postsTable,
  commentsTable,
  groupsTable,
  userGroups,
] as const;

const schema = createSchemaBuilder(db, tables)
  .table("users", {
    oneToOne: [
      {
        relationName: "profile",
        relatedTable: "profiles",
        localKey: "users.id",
        foreignKey: "profiles.userId",
      },
      {
        relationName: "company",
        relatedTable: "companies",
        localKey: "users.companyId",
        foreignKey: "companies.id",
      },
    ],
    oneToMany: [
      {
        relationName: "posts",
        relatedTable: "posts",
        localKey: "users.id",
        foreignKey: "posts.userId",
      },
    ],
    manyToMany: [
      {
        relationName: "groups",
        joinTable: "users_to_groups",
        localKey: "users.id",
        joinLocalKey: "users_to_groups.userId",
        relatedTable: "groups",
        relatedKey: "groups.id",
        joinRelatedKey: "users_to_groups.groupId",
      },
    ],
  })
  .build();

type Repo = ReturnType<typeof schema.repoFactory<"users", {}>>;
type F = Parameters<Repo["searchMany"]>;

type Q = NonNullable<F[0]>["filter"];
type P = NonNullable<F[0]>["projection"];
type O = NonNullable<F[0]>["order"];
const qFilter: Q = {
  $or: [
    { email: { $like: "Cierra_Hackett%" } },
    { "posts.title": { $like: "%sunt aut facere%" } },
    { tags: { $in: ["tag1"] } },
    { "persona.hobbies": { $in: ["footbal", "baskeet"] } },
  ],
};
const qProjection: P = [
  "id",
  "name",
  "tags",
  "email",
  "persona.hobbies",
  "company.name",
  "profile.bio",
  ''
];
const qOrder: O = {
  name: {
    direction: "asc",
    nulls: "last",
  },
  age: {
    direction: "desc",
    nulls: "last",
    aggregate: "max",
  },
  "profile.bio": {
    direction: "asc",
    aggregate: "min",
  },
  persona: "desc",
};
type E = InferEntity<
  TSchemaContext<typeof db, typeof tables, (typeof schema)["metadata"]>,
  "users"
>;
type FP = FlattenPaths<E>;
const testFP: FP = "invalid_string";

type FQ = FilterQuery<E>;
const testFQ: FQ = {
  email: { $like: "Cierra_Hackett%" }
};
