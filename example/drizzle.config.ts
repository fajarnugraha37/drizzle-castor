import { defineConfig } from "drizzle-kit";
import { getDatabaseFileLocation } from "./helper";


export default defineConfig({
  out: "./drizzle",
  schema: "./schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: getDatabaseFileLocation(),
  },
});