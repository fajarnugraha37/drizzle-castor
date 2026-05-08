# Quickstart: Drizzle Castor

Get up and running with Drizzle Castor in under 5 minutes.

## 1. Installation

```bash
npm install @fajarnugraha37/drizzle-castor
# or
bun add @fajarnugraha37/drizzle-castor
```

## 2. Define Schema & Metadata

Drizzle Castor needs to know about your tables and how they relate.

```typescript
import { db } from "./db";
import { users, posts } from "./schema";
import { defineSchemaMetadata } from "@fajarnugraha37/drizzle-castor";

export const schema = defineSchemaMetadata(db, [users, posts])({
  users: {
    oneToMany: [
      {
        relationName: "posts",
        relatedTable: "posts",
        foreignKey: "posts.userId",
        localKey: "users.id",
      },
    ],
    profiles: {
      admin: ["read", "create", "update", "hardDelete"],
      guest: ["read"],
    },
  },
  posts: {
    manyToOne: [
      {
        relationName: "author",
        relatedTable: "users",
        localKey: "posts.userId",
        foreignKey: "users.id",
      },
    ],
    profiles: {
      guest: ["read"],
    },
  },
});
```

## 3. Create a Repository

Repositories are typed based on your profile definitions.

```typescript
const userRepo = schema.repoFactory("users", {
  guest: {
    allowedProjections: ["id", "name"], // Guests can't see emails
    allowedFilters: ["name"],
  },
  admin: {
    allowedProjections: ["*"], // Admins see everything
  }
});
```

## 4. Query with Power

No more manual joins. Just use dot-notation.

```typescript
// Deeply nested search with automatic hydration
const results = await userRepo.searchMany({
  projection: [
    "name",
    "posts.title" // Automatically joins and nests posts
  ],
  filter: {
    "posts.title": { $ilike: "%drizzle%" }
  }
}, "guest");
```

## 5. Relationship and Join Capabilities

Drizzle Castor handles complex relationships automatically through its "Split Query" architecture.

- **Deep Joins**: Query across multiple levels of relations (e.g., `posts.comments.author.name`).
- **Fan-out Protection**: Prevents duplicate parent records when joining one-to-many or many-to-many relations.
- **Automatic Hydration**: Flat database rows are transformed into deeply nested object trees.

```typescript
const detailedResults = await userRepo.searchMany({
  projection: [
    "name",
    "posts.title",
    "posts.comments.content",
    "posts.comments.author.name"
  ]
});
```

## 6. JSON Column Support

Query and project properties inside JSON columns using dot-notation, just like relations.

```typescript
// Assuming 'metadata' is a JSON column
const results = await userRepo.searchMany({
  projection: ["name", "metadata.theme.color"],
  filter: {
    "metadata.settings.notifications": { $eq: true }
  }
});
```

## 7. Soft Deletion

Configure records to be marked as deleted instead of being physically removed from the database.

### Configuration

Add the `softDelete` property to your table metadata.

```typescript
users: {
  softDelete: {
    // Values to set when deleting
    deleteValue: {
      deletedAt: () => Date.now(),
      deletedFlag: 1,
    },
    // Values to set when restoring
    restoreValue: {
      deletedAt: null,
      deletedFlag: 0,
    }
  },
  profiles: {
    admin: ["read", "create", "update", "softDelete", "restore", "hardDelete"],
  }
}
```

### Usage

Once configured, use the dedicated soft delete methods. Active records are automatically filtered in standard search methods.

```typescript
// Soft delete a record
await userRepo.softDeleteOne(userId, "admin");

// Search only deleted records
const deletedUsers = await userRepo.searchDeletedMany({
  projection: ["name", "deletedAt"]
}, "admin");

// Restore a record
await userRepo.restoreOne(userId, "admin");
```

## 8. Lifecycle Hooks

Inject custom logic before or after database operations.

```typescript
posts: {
  hooks: {
    beforeSearch: async (query) => {
      console.log("Searching posts with query:", query);
    },
    afterSearch: async (query, results) => {
      console.log(`Found ${results.length} results`);
    }
  }
}
```

## 9. Filter Operators Reference

Drizzle Castor supports a wide range of operators for complex filtering.

### Comparison
- `$eq`, `$ne`: Equal, Not Equal
- `$gt`, `$gte`: Greater Than, Greater Than or Equal
- `$lt`, `$lte`: Less Than, Less Than or Equal
- `$isNull`, `$notIsNull`: Null checks

### String
- `$like`, `$ilike`: Case-sensitive and Case-insensitive like
- `$notLike`, `$notIlike`: Negated like patterns

### Array and Range
- `$in`, `$notIn`: Check if value is in a list
- `$between`, `$notBetween`: Range checks
- `$arrayContains`: For Postgres/JSON arrays

### Logical
- `$and`, `$or`, `$not`: Combine multiple conditions

```typescript
{
  filter: {
    $or: [
      { status: { $eq: "active" } },
      { "metadata.version": { $gt: 2 } }
    ]
  }
}
```

## 10. Basic CRUD

```typescript
// Create
const newUser = await userRepo.createOne({
  name: "Alice",
  email: "alice@example.com"
}, "admin");

// Update
await userRepo.updateOne(newUser.id, {
  name: "Alice Updated"
}, "admin");

// Paginate
const { data, meta } = await userRepo.searchPage({
  page: 1,
  pageSize: 10
}, "guest");
```

## Next Steps

- Check `README.md` for Soft Delete configuration.
- See `src/types/query.ts` for a full list of Filter Operators ($gt, $in, $or, etc.).
- Read `NOTE.md` to understand the TypeScript Engine under the hood.
