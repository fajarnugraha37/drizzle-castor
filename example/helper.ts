import { existsSync } from "fs";

export function getDatabaseFileLocation(): string {
  for (const arg of ["../db.sqlite", "./db.sqlite", "./example/db.sqlite"]) {
    if (existsSync(arg)) {
      return arg;
    }
  }
  throw new Error(
    "Database file not found. Please ensure 'db.sqlite' exists in the project root or parent directory.",
  );
}
