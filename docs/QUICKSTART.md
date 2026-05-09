# Quick Start: Drizzle-Castor

`drizzle-castor` is a type-safe CRUD library and Data Access Object (DAO) abstraction over Drizzle ORM. It simplifies database operations by providing a JSON-based querying syntax, native soft-deletes, unified Role-Based Access Control (RBAC), and dialect-agnostic execution strategies.

---

## 1. Setup & Configuration

First, initialize your standard Drizzle ORM database instance and your schema tables. Then, use `createSchemaBuilder` to configure your library.

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite"; // Or pg/mysql
import { createSchemaBuilder } from "@fajarnugraha37/drizzle-castor";
import { usersTable, postsTable, profilesTable } from "./schema";

const db = drizzle("sqlite.db");

// 1. Instantiate the Builder
export const schemaMetadataBuilder = createSchemaBuilder(db, [
  usersTable,
  postsTable,
  profilesTable
] as const, "lenient"); // Use "strict" to block all actions without an explicit RBAC policy
```

---

## 2. Defining Relations & Capabilities

Define your table relationships and soft-delete behaviors dynamically without cluttering your physical Drizzle schema.

```typescript
schemaMetadataBuilder.table("users", {
  // Define 1:1, 1:N, M:1, and M:N relationships
  oneToOne: [
    {
      relationName: "profile",
      relatedTable: "profiles",
      localKey: "users.id",
      foreignKey: "profiles.userId",
    }
  ],
  oneToMany: [
    {
      relationName: "posts",
      relatedTable: "posts",
      localKey: "users.id",
      foreignKey: "posts.userId",
    },
  ],
  // Enable Soft Delete capabilities automatically
  softDelete: {
    deleteValue: { deletedFlag: 1 },
    restoreValue: { deletedFlag: 0 },
  },
});
```

---

## 3. Defining Unified RBAC Policies (Access Control)

`drizzle-castor` enforces security intrinsically at the Data Access layer. Rather than writing authorization checks in every service function, you define policies at the Schema Builder level. The Unified RBAC middleware intercepts every database request, evaluating the active profile against the policies before the query reaches Drizzle ORM.

### A. Strict vs Lenient Mode
When creating the schema builder, you define an execution mode:
- **`lenient` (Default)**: If a table has no policy defined, all actions are permitted. Unspecified rules default to allowing access.
- **`strict`**: Every table *must* have an explicit policy. If a user queries a table without an assigned policy, an `AccessDeniedError` is immediately thrown.

### B. What is a Profile?
A Profile represents the role or persona executing the database action (e.g., `"public"`, `"admin"`, `"user"`).
- When calling a repository method, you *must* pass the profile: `await repo.searchOne(..., "admin")`.
- **Multiple Profiles**: You can pass an array of profiles (e.g., `["public", "editor"]`). The RBAC engine will safely **merge** the capabilities of all matched profiles. If one profile allows a field and the other doesn't, the field is allowed (Union). If no profile is provided, it falls back to `"default"`.

### C. Action-Level Access Control
The `allowedActions` property defines which physical database operations the profile can perform.
- Available actions: `"create"`, `"read"`, `"update"`, `"softDelete"`, `"restore"`, `"hardDelete"`.
- If a profile attempts an action not explicitly listed in their policy (e.g., calling `.updateMany()` when they only have `["read"]`), the middleware throws an `AccessDeniedError`.
- Use `"*"` to grant full CRUD permissions.

### D. Field-Level Access Control (Data Trimming)
Instead of throwing hard errors when an unauthorized field is requested, the RBAC engine employs **Intelligent Data Trimming**. It silently removes unauthorized fields from the payload, allowing the safe parts of the query to execute. *(Note: If all fields in a clause are trimmed and the clause becomes empty, it will then throw an error).*

- **`allowedProjections` (SELECT Clause)**: Restricts what data can be returned. If a user requests `projection: ["name", "email", "passwordHash"]` but only `"name"` is allowed, the query seamlessly executes as `SELECT name FROM...`.
- **`allowedFilters` (WHERE Clause)**: Restricts which fields the user can query against. The engine recursively traverses complex `$and` / `$or` / `$not` AST trees. If a condition targets an unpermitted field, that specific node is discarded without breaking the rest of the filter logic.
- **`allowedSets` (INSERT / UPDATE Clauses)**: Prevents writing to restricted columns. If a payload tries to update `{ name: "John", role: "admin" }` but `"role"` is restricted, only the `"name"` update is sent to the database.
- **`allowedSorts` (ORDER BY Clause)**: Drops unpermitted sorting keys.

*Note on JSON & Relations:* Field rules fully support JSON dot-notation and relational paths. Allowing a parent path (e.g., `"settings"`) implicitly allows querying any nested JSON property within it (e.g., `"settings.theme"`).

### E. Static vs Dynamic Policies
Policies can be statically defined objects or asynchronous functions that resolve rules dynamically based on the current `ExecutionContext` (which carries contextual data like tenant IDs or request headers).

```typescript
schemaMetadataBuilder.profiles(['default', 'public', 'admin', 'tenant_user'] as const);

schemaMetadataBuilder.policies('users', {
  // 1. Static Policy: Applied consistently to the 'public' profile
  public: { 
    allowedActions: ["read"],
    allowedFilters: ["name", "email", "settings.theme"], // Allows filtering on JSON properties!
    allowedProjections: ["name", "profile.bio"], // Allows fetching relational data!
  },
  
  // 2. Static Wildcard: Full access for 'admin'
  admin: {
    allowedActions: "*",
    allowedSets: "*",
    allowedProjections: "*",
    allowedFilters: "*",
    allowedSorts: "*"
  },

  // 3. Dynamic Policy: Resolves permissions at runtime
  tenant_user: async (ctx) => {
    // Inspect ctx variables set by upstream authentication middlewares
    const isOwner = ctx.params.filter?.id?.$eq === ctx.variables?.userId;
    
    return {
      allowedActions: isOwner ? ["read", "update"] : ["read"],
      allowedSets: ["settings.theme", "persona.skills"],
      // Dynamic field resolution is also supported
      allowedProjections: async (innerCtx) => {
        return isOwner ? ["*"] : ["name", "avatar"];
      },
      allowedFilters: "*",
      allowedSorts: "*"
    };
  }
});
```

---

## 4. Finalizing and Creating Repositories

Once configured, build the metadata and instantiate a repository for a specific table.

```typescript
// Finalize the global configuration
export const schemaMetadata = schemaMetadataBuilder.build();

// Create a typed Repository for the "users" table
const userRepo = schemaMetadata.repoFactory("users");
```

You can also override or append specific RBAC configurations at the repository generation level:

```typescript
const userRepo = schemaMetadata.repoFactory("users", {
  public: { allowedProjections: ["id", "name"] } // Local override
});
```

---

## 5. Available Repository Methods

The generated Repository provides strongly-typed methods. You must always pass the active `profile` (e.g., `"admin"`) to evaluate against the RBAC engine.

### A. Reading Data (Relations & JSON Paths)
You can utilize standard filters, projections, and deep dot-notation paths. The AST Translator will automatically build the necessary SQL `JOIN`s or JSON extraction functions under the hood.

```typescript
// Fetch a single record with Deep Relations and JSON extraction
const user = await userRepo.searchOne({
  projection: [
    "name", 
    "profile.bio",               // 1:1 Relation
    "posts.title",               // 1:N Relation
    "posts.comments.content",    // Nested 1:N Relation
    "settings.theme",            // JSON Object extraction
    "persona.skills.0"           // JSON Array extraction (Index 0)
  ], 
  filter: {
    $or: [
      { name: { $like: "%John%" } },
      { "settings.theme": { $eq: "dark" } },      // Query directly against JSON columns
      { "persona.skills.0": { $eq: "Node.js" } }, // Query against an array index
      { "posts.title": { $like: "%Drizzle%" } }   // Filter by a related table's column
    ]
  },
  order: {
    "createdAt": "desc",
    "posts.comments.createdAt": "desc" // Order by nested relation
  }
}, "admin");
```

#### The Hydrated Return Format
Unlike raw SQL which returns flat rows with duplicated data, `drizzle-castor` automatically hydrates and collapses the results back into a clean, nested JavaScript object reflecting your query shape:

```json
{
  "id": 1,
  "name": "John Doe",
  "settings": {
    "theme": "dark"
  },
  "persona": {
    "skills": ["Node.js"]
  },
  "profile": {
    "id": 101,
    "bio": "Backend Developer"
  },
  "posts": [
    {
      "id": 201,
      "title": "Learning Drizzle",
      "comments": [
        { "id": 301, "content": "Great post!" },
        { "id": 302, "content": "Thanks for sharing." }
      ]
    }
  ]
}
```

#### Fetching Collections & Pagination

```typescript
// Fetch multiple records (Returns an Array of objects)
const users = await userRepo.searchMany({
  order: { createdAt: "desc" }
}, "admin");

// Fetch paginated results
const page = await userRepo.searchPage({
  page: 1,
  pageSize: 10,
  filter: { "posts.comments.content": { $isNotNull: true } }
}, "public");

// Returns:
// { 
//   data: [{ id: 1, name: "John", posts: [...] }, ...], 
//   meta: { currentPage: 1, pageSize: 10, totalPages: 5, totalItems: 42 } 
// }
```

### B. Creating Data

```typescript
// Create a single record
const newUser = await userRepo.createOne({
  name: "Jane Doe",
  email: "jane@example.com"
}, "admin");

// Create multiple records
const newUsers = await userRepo.createMany([
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" }
], "admin");
```

### C. Updating Data

```typescript
// Update by Primary Key
const updated = await userRepo.updateOne(1, {
  name: "John Updated",
  "settings.theme": "light" // Partially update a JSON column securely
}, "admin");

// Update multiple using abstract filters
const batchUpdated = await userRepo.updateMany(
  { age: { $lt: 18 } }, 
  { "settings.notifications": false }, 
  "admin"
);
```

### D. Deleting & Restoring Data
If you configured `softDelete` on the table, the Soft Delete and Restore methods become available.

```typescript
// Soft Delete
await userRepo.softDeleteOne(1, "admin");
await userRepo.softDeleteMany({ "settings.theme": { $eq: "light" } }, "admin");

// Restore
await userRepo.restoreOne(1, "admin");

// Hard Delete (Permanent)
await userRepo.hardDeleteOne(1, "admin");
```

---

## 6. Middlewares and Hooks

You can intercept the repository lifecycle using Koa-style middlewares.

```typescript
schemaMetadataBuilder.use(async (ctx, next) => {
  console.log(`Executing ${ctx.action} on table ${ctx.tableName}`);
  
  // Await the underlying database execution
  const result = await next();
  
  console.log(`Finished execution!`);
  return result;
});
```