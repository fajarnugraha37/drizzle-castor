import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  age: int("age"),
  metadata: text({ mode: "json" }).$type<{ theme: string; tags: string[] }>(),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: text("deleted_at"),
});

export const profiles = sqliteTable("profiles", {
  id: int("id").primaryKey({ autoIncrement: true }),
  bio: text("bio"),
  userId: int("user_id").notNull().references(() => users.id),
});

export const posts = sqliteTable("posts", {
  id: int("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  authorId: int("author_id").references(() => users.id),
  deletedFlag: int("deleted_flag").default(0),
});
