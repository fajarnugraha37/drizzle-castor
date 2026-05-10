# Drizzle-Castor Type System Documentation

This document explains the advanced TypeScript mechanics powering `drizzle-castor`. We leverage complex generics, recursive mapped types, and conditional types to ensure end-to-end type safety—from schema definition down to the hydrated query results.

---

## 1. Inferring Base Models from Drizzle

The foundation of our type system relies on Drizzle ORM's native type inference. We extract the exact shapes of your tables without requiring you to write redundant TypeScript interfaces.

Using internal helpers (`InferEntity` and `InferModel`), the library infers the `Select` and `Insert` types directly from the Drizzle table objects passed to the schema builder. 

```typescript
// Drizzle Schema
export const usersTable = sqliteTable("users", {
  id: int("id").primaryKey(),
  name: text("name").notNull(),
});

// drizzle-castor implicitly infers this as:
type UserEntity = {
  id: number;
  name: string;
};
```

---

## 2. Dynamic Path Validation (`FlattenPaths`)

One of the core features of `drizzle-castor` is querying via dot-notation for both SQL relationships and nested JSON columns. To make this type-safe, we use the recursive `FlattenPaths` generic.

The `FlattenPaths` generic recursively traverses the inferred entity type up to a defined depth (default is 5). It generates a union of all possible valid string paths, natively supporting array indices.

```typescript
type User = {
  id: number;
  persona: {
    skills: string[];
    role: string;
  };
};

// Generates: "id" | "persona" | "persona.skills" | "persona.skills.0" | "persona.role"
type ValidUserPaths = ValidPath<User>;
```

When you write a filter, TypeScript enforces that the string actually exists within the graph:
```typescript
userRepo.searchOne({
  filter: {
    "persona.role": { $eq: "admin" }, // ✅ Valid
    "persona.age": { $eq: 25 },       // ❌ TypeScript Error: property does not exist
  }
});
```

---

## 3. Strict Field Operators (`FieldOperators`)

Not all SQL operators are valid for all data types. For example, using `$like` on an integer should be prevented at compile-time.

The `FieldOperators` type uses conditional types to inspect the leaf value of your requested path (using `ValueAt<T, Path>`). It dynamically constructs the allowed operator payload.

```typescript
// If targeting a String path:
filter: {
  "name": { $like: "%John%", $ilike: "john" } // ✅ Allowed by StringOps
}

// If targeting a Number path:
filter: {
  "id": { $gt: 10, $lte: 50 }, // ✅ Allowed by OrderableOps
  "id": { $like: "%10%" }      // ❌ TypeScript Error: $like does not exist on numeric ops
}

// If targeting an Array path:
filter: {
  "persona.skills": { $arrayContains: ["TypeScript"] } // ✅ Allowed by ArrayContainmentOps
}
```

---

## 4. Shaping Return Types (`DeepPick`)

When fetching data, you rarely want the entire object graph, especially when utilizing RBAC data trimming. You use the `projection` array to select specific fields. 

We ensure the return type of your repository methods accurately reflects this selection using the `DbQueryResult` and `DeepPick` generics.

```typescript
const user = await userRepo.searchOne({
  projection: ["id", "persona.skills.0"]
});

// TypeScript infers `user` exactly as:
// {
//   id: number | null;
//   persona: {
//     skills: string[]; // Truncated to just what you asked for
//   }
// }
```

If you omit the `projection` array, the repository safely defaults to returning the full inferred `TEntity` type.

---

## 5. Schema Metadata & The Factory

The `createSchemaBuilder` acts as the master type registry. By passing your tables as a `const` tuple, TypeScript infers the exact table names and their specific relationship configurations.

```typescript
const builder = createSchemaBuilder(db, [usersTable, postsTable] as const);

// TTableName is strictly typed to "users" | "posts"
const userRepo = builder.build().repoFactory("users");
```
// ...
Because `userRepo` is instantiated with the literal `"users"`, all repository methods (`createOne`, `searchMany`, `updateMany`) are permanently bound to the `UserEntity` type and its valid relational paths, securing the entire API surface from end to end.

---

## 6. Telemetry & Event Types

We use a strictly typed event bus via `mitt`. Every event payload is defined to ensure that subscribers can safely access metadata, performance metrics, and mutation records.

```typescript
type TelemetryEvents = {
  execution: ExecutionEvent;   // Latency, status, traceId
  security: SecurityEvent;     // Audit logs for field trimming
  error: ErrorEvent;           // Global exception details
  "soft-deleted": MutationEvent; // Records affected by soft-delete
  "restored": MutationEvent;     // Records affected by restore
  "hard-deleted": MutationEvent; // Records affected by permanent delete
};
```

Subscribing is type-safe:
```typescript
builder.on('execution', (ev) => {
  ev.duration; // inferred as number
  ev.action;   // inferred as "read" | "create" | ...
});
```

---

## 7. Hybrid RBAC & Global Policy Types

The policy system supports both static maps and dynamic callbacks. TypeScript ensures that your profile names are consistent throughout the application.

```typescript
// Define valid profiles once
builder.profiles(['admin', 'guest'] as const);

// Policy definitions are now checked against those profiles
builder.policies('users', {
  admin: { allowedActions: "*" }, // Valid
  super: { ... } // Error: "super" is not in ['admin', 'guest']
});
```

The `UnifiedPolicyConfig` supports:
- **Declarative**: `Record<TProfile, PolicyDefinition>`
- **Imperative**: `(ctx) => PolicyDefinition | Promise<PolicyDefinition>`
- **Global**: `(ctx, table, profiles) => PolicyDefinition`

---

## 8. Logger Configuration Types

The internal logger configuration allows for Quarkus-style pattern strings and log levels.

```typescript
type LogLevel = "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | "OFF";

interface LoggerConfig {
  level?: LogLevel;
  pattern?: string; // e.g., "%d %p [%c] (%t) %s"
}
```