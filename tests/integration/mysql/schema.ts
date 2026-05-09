import { mysqlTable, serial, text, int, json, timestamp, primaryKey, varchar } from "drizzle-orm/mysql-core";

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

export const postsToCategories = mysqlTable("posts_to_categories", {
  postId: int("post_id").notNull(),
  categoryId: int("category_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.postId, t.categoryId] })
]);
