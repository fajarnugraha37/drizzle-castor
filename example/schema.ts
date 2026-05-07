import { int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  age: int("age"),
  tags: text({ mode: 'json' }).$type<string[]>(),
  persona: text({ mode: 'json' }).$type<{ hobbies: string[]; skills: string[] }>(),
  
  companyId: int("company_id").references(() => companiesTable.id),

  createdAt: int("created_at").$default(() => Date.now()),
  createdBy: text("created_by").default("system"),
  updatedAt: int("updated_at").$default(() => Date.now()).$onUpdate(() => Date.now()),
  updatedBy: text("updated_by").default("system").$onUpdate(() => "system"),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: int("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const postsTable = sqliteTable("posts", {
  id: int("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  userId: int("userId").references(() => usersTable.id),
  
  createdAt: int("created_at").$default(() => Date.now()),
  createdBy: text("created_by").default("system"),
  updatedAt: int("updated_at").$default(() => Date.now()).$onUpdate(() => Date.now()),
  updatedBy: text("updated_by").default("system").$onUpdate(() => "system"),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: int("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const commentsTable = sqliteTable("comments", {
  id: int("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  postId: int("postId").references(() => postsTable.id),
  
  createdAt: int("created_at").$default(() => Date.now()),
  createdBy: text("created_by").default("system"),
  updatedAt: int("updated_at").$default(() => Date.now()).$onUpdate(() => Date.now()),
  updatedBy: text("updated_by").default("system").$onUpdate(() => "system"),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: int("deleted_at"),
  deletedBy: text("deleted_by"),
});

export const profilesTable = sqliteTable("profiles", {
  id: int("id").primaryKey({ autoIncrement: true }),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  userId: int("user_id").references(() => usersTable.id),
});

export const companiesTable = sqliteTable("companies", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const groupsTable = sqliteTable("groups", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const userGroups = sqliteTable(
  "users_to_groups",
  {
    userId: int("user_id")
      .notNull()
      .references(() => usersTable.id),
    groupId: int("group_id")
      .notNull()
      .references(() => groupsTable.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);