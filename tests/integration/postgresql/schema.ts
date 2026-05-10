import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  age: integer("age"),
  metadata: jsonb("metadata").$type<{ theme: string; tags: string[] }>(),
  settings: jsonb("settings").$type<{
    persona?: {
      nickName?: string;
      avatarUrl?: string;
      hobbies?: string[];
    };
    theme?: string;
  }>(),
  deletedFlag: integer("deleted_flag").default(0),
  deletedAt: timestamp("deleted_at"),
});

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  bio: text("bio"),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  authorId: integer("author_id").references(() => users.id),
  deletedFlag: integer("deleted_flag").default(0),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const postsToCategories = pgTable(
  "posts_to_categories",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
  },
  (t) => [primaryKey({ columns: [t.postId, t.categoryId] })],
);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
});

export const reactions = pgTable("reactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  commentId: integer("comment_id")
    .notNull()
    .references(() => comments.id),
});

export const migrations = [
  sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    age INTEGER,
    metadata JSONB,
    settings JSONB,
    deleted_flag INTEGER DEFAULT 0,
    deleted_at TIMESTAMP
  );`,
  sql`CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    bio TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id)
  );`,
  sql`CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    author_id INTEGER REFERENCES users(id),
    deleted_flag INTEGER DEFAULT 0
  );`,
  sql`CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );`,
  sql`CREATE TABLE IF NOT EXISTS posts_to_categories (
    post_id INTEGER NOT NULL REFERENCES posts(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    PRIMARY KEY (post_id, category_id)
  );`,
  sql`CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    post_id INTEGER NOT NULL REFERENCES posts(id)
  );`,
  sql`CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    comment_id INTEGER NOT NULL REFERENCES comments(id)
  );`,
];
