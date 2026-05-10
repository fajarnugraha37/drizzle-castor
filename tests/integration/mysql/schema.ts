import { sql } from "drizzle-orm";
import {
  mysqlTable,
  serial,
  text,
  int,
  json,
  timestamp,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  age: int("age"),
  metadata: json("metadata").$type<{ theme: string; tags: string[] }>(),
  settings: json("settings").$type<{
    persona?: {
      nickName?: string;
      avatarUrl?: string;
      hobbies?: string[];
    };
    theme?: string;
  }>(),
  deletedFlag: int("deleted_flag").default(0),
  deletedAt: timestamp("deleted_at"),
});

export const profiles = mysqlTable("profiles", {
  id: serial("id").primaryKey(),
  bio: text("bio"),
  userId: int("user_id").notNull(),
});

export const posts = mysqlTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  authorId: int("author_id"),
  deletedFlag: int("deleted_flag").default(0),
});

export const categories = mysqlTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const postsToCategories = mysqlTable(
  "posts_to_categories",
  {
    postId: int("post_id").notNull(),
    categoryId: int("category_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.categoryId] })],
);

export const comments = mysqlTable("comments", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  postId: int("post_id").notNull(),
});

export const reactions = mysqlTable("reactions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  commentId: int("comment_id").notNull(),
});

export const migrations = [
  sql`CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name TEXT NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      age INT,
      metadata JSON,
      settings JSON,
      deleted_flag INT DEFAULT 0,
      deleted_at TIMESTAMP NULL
    )
  `,
  sql`CREATE TABLE profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      bio TEXT,
      user_id INT NOT NULL
    )
  `,
  sql`CREATE TABLE posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      author_id INT,
      deleted_flag INT DEFAULT 0
    )
  `,
  sql`CREATE TABLE categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name TEXT NOT NULL
    )
  `,
  sql`CREATE TABLE posts_to_categories (
      post_id INT NOT NULL,
      category_id INT NOT NULL,
      PRIMARY KEY (post_id, category_id)
    )
  `,
  sql`CREATE TABLE comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      content TEXT NOT NULL,
      post_id INT NOT NULL
    )
  `,
  sql`CREATE TABLE reactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type TEXT NOT NULL,
      comment_id INT NOT NULL
    )
  `,
];
