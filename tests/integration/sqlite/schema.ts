import { sql } from "drizzle-orm";
import { int, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  age: int("age"),
  metadata: text({ mode: "json" }).$type<{ theme: string; tags: string[] }>(),
  settings: text({ mode: "json" }).$type<{
    persona?: {
      nickName?: string;
      avatarUrl?: string;
      hobbies?: string[];
    };
    theme?: string;
  }>(),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: text("deleted_at"),
});

export const profiles = sqliteTable("profiles", {
  id: int("id").primaryKey({ autoIncrement: true }),
  bio: text("bio"),
  userId: int("user_id")
    .notNull()
    .references(() => users.id),
});

export const posts = sqliteTable("posts", {
  id: int("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  authorId: int("author_id").references(() => users.id),
  deletedFlag: int("deleted_flag").default(0),
});

export const categories = sqliteTable("categories", {
  id: int("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});

export const postsToCategories = sqliteTable("posts_to_categories", {
  postId: int("post_id").notNull().references(() => posts.id),
  categoryId: int("category_id").notNull().references(() => categories.id),
}, (t) => [
  primaryKey({ columns: [t.postId, t.categoryId] })
]);

export const comments = sqliteTable("comments", {
  id: int("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  postId: int("post_id")
    .notNull()
    .references(() => posts.id),
});

export const reactions = sqliteTable("reactions", {
  id: int("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  commentId: int("comment_id")
    .notNull()
    .references(() => comments.id),
});

export const migrations = [
  sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    age INTEGER,
    metadata TEXT,
    settings TEXT,
    deleted_flag INTEGER DEFAULT 0,
    deleted_at TEXT
  )`,
  sql`CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id),
    deleted_flag INTEGER DEFAULT 0
  )`,
  sql`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS posts_to_categories (
    post_id INTEGER NOT NULL REFERENCES posts(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    PRIMARY KEY (post_id, category_id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    post_id INTEGER NOT NULL REFERENCES posts(id)
  )`,
  sql`CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    comment_id INTEGER NOT NULL REFERENCES comments(id)
  )`
];
