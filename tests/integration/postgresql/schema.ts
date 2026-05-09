import { pgTable, serial, text, integer, jsonb, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";

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
  userId: integer("user_id").references(() => users.id).notNull(),
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

export const postsToCategories = pgTable("posts_to_categories", {
  postId: integer("post_id").notNull().references(() => posts.id),
  categoryId: integer("category_id").notNull().references(() => categories.id),
}, (t) => [
  primaryKey({ columns: [t.postId, t.categoryId] })
]);
