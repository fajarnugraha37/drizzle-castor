import { int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  age: int("age"),
  tags: text({ mode: 'json' }).$type<string[]>(), // JSON for array of strings
  createdAt: int("created_at"),
  // JSONB for nested data (or use separate tables with relations)
  persona: text({ mode: 'json' }).$type<{ hobbies: string[]; skills: string[] }>(),
  companyId: int("company_id").references(() => companies.id),
});

export const profiles = sqliteTable("profiles", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id").references(() => users.id),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
});

export const books = sqliteTable("books", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id").references(() => users.id),
  title: text("title").notNull(),
  publishedYear: int("published_year"),
  author: text("author"), // { firstName: string, lastName: string }
});

export const posts = sqliteTable("posts", {
  id: int("id").primaryKey({ autoIncrement: true }),
  content: text("content"),
  authorId: int("author_id").references(() => users.id),
  reviewerId: int("reviewer_id"),
});

export const companies = sqliteTable("companies", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const groups = sqliteTable("groups", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const userGroups = sqliteTable(
  "users_to_groups",
  {
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    groupId: int("group_id")
      .notNull()
      .references(() => groups.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);
