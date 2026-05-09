# How It Works: Drizzle-Castor

This document details the internal mechanics of `drizzle-castor`, explaining how the library abstracts complex database operations, translates JSON objects to raw SQL queries, handles JSON fields, implements security through Access Control (RBAC), and provides seamless multi-dialect support (PostgreSQL, MySQL, SQLite).

---

## 1. The Abstract Syntax Tree (AST) Translator Flow

`drizzle-castor` essentially operates as a transpiler. It takes generic, developer-friendly JSON payloads (used for filters, orders, projections, and updates) and translates them into physical, dialect-aware `drizzle-orm` SQL statements. 

This process guarantees type-safety and abstracts away the complexity of manual JOINs and dialect differences. The lifecycle of a query looks like this:
`JSON Payload -> Middleware Validation -> Query Parser (AST Compiler) -> Executor -> Drizzle ORM -> DB Engine`

#### The Components

##### A. Filters (`parseFilter`)
Filters define the `WHERE` clauses. The library parses nested logical operators (`$and`, `$or`, `$not`) recursively.
- **Path Resolution:** The library evaluates the dot-notation keys (e.g., `"profile.address.city"`) and dynamically determines if it's a direct column, a relationship, or a JSON path inside a column.
- **Operator Mapping:** The value object (e.g., `{ $eq: "Jakarta", $gt: 10 }`) is sent to `buildFieldOperator`, which constructs the corresponding Drizzle operators (`eq()`, `gt()`, `like()`, etc.).

##### B. Projections (`buildSelection`)
Projections dictate the `SELECT` clause.
- When an array of strings is passed, the AST compiler evaluates each string.
- If it's a relationship, it ensures the related table's primary key is also fetched (necessary for hydration).
- If it's a nested JSON path, it utilizes the `buildJsonExtractionSql` to fetch exactly that nested property.

##### C. Ordering (`parseOrder`)
Orders dictate the `ORDER BY` clause.
- Handled via `parseOrder`, which maps string keys and configuration objects `{ direction: "desc", nulls: "last" }` to raw SQL ordering chunks.
- Smart Aggregation: Allows aggregations via the `aggregate` property (e.g., `MAX`, `MIN`, `COUNT`), automatically translating it to `sql\`MAX(${col})\``.

##### D. Updates / Sets (`parseUpdateSet`)
- Regular columns are mapped directly to their SQL counterparts.
- Dot-notation paths inside sets imply a JSON column mutation. These are handled gracefully per dialect (see JSON Path Handling below).

### Step-by-Step Execution Flow (From Hulu to Hilir)

When a developer calls a repository method (e.g., `userRepo.searchMany({ filter: { "posts.title": { $like: "%Drizzle%" } } })`), the payload embarks on a multi-stage pipeline:

#### Step 1: Payload Interception & Middleware (Hulu)
- The raw JSON payload first enters the execution context pipeline (`runInContext`).
- It passes through the `createUnifiedRbacMiddleware`.
- **Action:** The RBAC engine evaluates the payload. It strictly trims unpermitted fields from the filter, projection, order, and set payloads. If a prohibited action is requested, an `AccessDeniedError` halts execution immediately.

#### Step 2: Path Analysis (`analyzer.ts`)
- The clean payload is handed to the `analyzeQuery` function.
- **Action:** It traverses the JSON tree (Filters, Orders, Projections) looking for dot-notation paths (e.g., `"posts.comments.content"`).
- It validates these paths against the predefined table relations in `schema-metadata.ts`.
- It outputs a `Set` of unique relational paths needed to satisfy the query (e.g., `Set(["posts", "posts.comments"])`).

#### Step 3: Alias Management & Table Binding (`alias-manager.ts`)
- **Action:** Using the discovered paths, the `buildAliases` function generates unique SQL table aliases for every relational hop.
- For example, if `"posts"` is joined, it creates an alias like `rel_posts`. If `"posts.comments"` is joined, it creates `rel_posts_comments`.
- This ensures that if multiple tables have a column named `id` or `created_at`, the resulting SQL won't suffer from ambiguous column errors.

#### Step 4: Recursive AST Parsing (`filter-builder.ts` & `operator-builder.ts`)
- The AST Compiler (`parseFilter`) begins recursively walking the JSON filter object.
- **Logical Nodes (`$and`, `$or`, `$not`)**: When encountering logical operators, it recursively maps the children and stitches them together using Drizzle's `and()`, `or()`, and `not()` functions.
- **Leaf Nodes (Fields)**: When encountering a field (e.g., `"posts.title"`), it looks up the mapped SQL column from the `aliasMap`.
- **Operator Mapping**: It takes the value object (e.g., `{ $like: "%Drizzle%" }`) and sends it to `buildFieldOperator()`. This translates abstract operations into physical Drizzle operations (e.g., mapping `$like` to `like(column, value)`).

#### Step 5: Constructing the Physical Query (`ast-compiler.ts`)
- The physical SQL clauses are now assembled into a Drizzle QueryBuilder.
- **Applying Joins**: `applyJoins()` is called. It iterates over the alias map and automatically generates the necessary `LEFT JOIN` or `INNER JOIN` statements, wiring up the `localKey` and `foreignKey` defined in the metadata.
- **Injecting Soft-Deletes**: During the join phase, `applyJoins` implicitly injects `WHERE deleted_flag = 0` (or equivalent) into the JOIN conditions for any table that has soft-deletes configured.
- **Applying Selects**: `buildSelection()` dictates the `SELECT` clause, projecting only the requested fields and their corresponding aliases.

#### Step 6: Database Execution (The DB Engine)
- The fully assembled Drizzle QueryBuilder (which might include a CTE Split Query for pagination, see Section 4) is sent to the underlying database driver (pg, mysql2, or better-sqlite3).
- The raw SQL is executed atomically.

#### Step 7: Hydration and Re-Mapping (`hydrator.ts`)
- The database returns flat, tabular rows containing aliased column names (e.g., `rel_posts_title: "My Post"`).
- **Action:** The `hydrateResults` function intercepts this raw data.
- It uses the metadata and the alias maps to reverse-engineer the original dot-notation structure.
- It folds flat rows into rich, nested JavaScript objects and arrays, collapsing one-to-many relationships appropriately.

#### Step 8: Return (Hilir)
- The fully hydrated, type-safe object is returned back to the caller.

---

## 2. Handling JSON Paths

Databases handle JSON objects fundamentally differently. `drizzle-castor` masks these inconsistencies by securely converting standard dot-notation strings to dialect-specific JSON operators.

**Path Security:** All JSON paths pass through `validateJsonPath()`, preventing SQL injection or Prototype Pollution by restricting strings strictly to alphanumerics, dots, and array indices.

**Data Extraction (`buildJsonExtractionSql`):**
When a property like `"metadata.settings.theme"` is requested:
- **PostgreSQL:** Uses the `#>>` operator (e.g., `column#>>'{settings,theme}'`) to return unquoted text.
- **MySQL:** Uses the `->>` operator (e.g., `column->>'$.settings.theme'`).
- **SQLite:** Uses the `json_extract` function (e.g., `json_extract(column, '$.settings.theme')`).

**Data Mutations (`parseUpdateSet`):**
When partial updates are sent via the `updateOne` or `updateMany` function:
- **PostgreSQL:** Employs nested `jsonb_set()` combined with `COALESCE` to merge incoming data with the existing JSON payload.
- **MySQL:** Uses the `JSON_SET()` function, utilizing `CAST(value AS JSON)` to preserve object data types.
- **SQLite:** Uses the `json_set()` function with `json(value)`.

---

## 3. Access Control (Unified RBAC)

Security is implemented natively using a robust Role-Based Access Control (RBAC) middleware pipeline.

### The `unified-rbac` Middleware
Before any payload hits the translation layer or executor, it passes through the `createUnifiedRbacMiddleware`.

1. **Policy Resolution**: The middleware evaluates the current table against a defined `policyDef`. Depending on the `profile` active in the context, it fetches the `UnifiedPolicyConfig`.
2. **Action Level RBAC**: It checks if the current operation (`create`, `read`, `update`, `delete`, etc.) is permitted in the `allowedActions` array. If not, an `AccessDeniedError` is thrown immediately.
3. **Data Trimming (Field Level RBAC)**:
   - **Projections & Sorts**: Unpermitted fields requested in projections or order-bys are silently trimmed out, or rejected entirely depending on `isThrowError` settings.
   - **Filters**: The `$and`/`$or` tree is recursively traversed (`trimFilterObj`). If a user tries to query against an unpermitted field (e.g., `passwordHash: { $eq: "..." }`), that specific filter node is discarded.
   - **Mutations (Sets/Creates)**: Any payload attempting to write to unauthorized columns is stripped before the database transaction begins.

---

## 4. Multi-Dialect Support (PostgreSQL, MySQL, SQLite)

`drizzle-castor` provides strong guarantees on atomic mutations and prevents race conditions by leveraging specific database features. The library detects the current database dialect dynamically using duck-typing techniques in `getDialect()`.

### Strategy A: The `RETURNING` Clause (PostgreSQL & SQLite)
Because PostgreSQL and modern SQLite support robust `RETURNING` clauses, mutations are executed atomically within a transaction.
- When an `update` or `delete` happens, the database immediately returns the affected rows.
- If hydration is required (e.g., pulling nested relations post-update), the library uses the ID from the returned row to trigger a clean, separate hydration query.

**Example (PostgreSQL / SQLite Update):**
```sql
BEGIN;
-- The mutation happens and immediately returns the ID
UPDATE "users" SET "status" = 'active' WHERE "age" > 18 RETURNING "id";
-- If hydration is requested, fetch the full tree using the returned ID
SELECT ... FROM "users" LEFT JOIN "profiles" ... WHERE "users"."id" = $1;
COMMIT;
```

### Strategy B: The Temporary Table Fallback (MySQL)
MySQL does not support standard `RETURNING` clauses on `UPDATE` or `DELETE` statements. To circumvent this and still ensure secure, race-condition-free batch mutations:
1. **Create Temp Table**: An ephemeral `TEMPORARY TABLE` is spawned within the transaction.
2. **Snapshot Targets**: An `INSERT INTO ... SELECT` query captures the primary keys of the rows that *will* be mutated based on the AST filter.
3. **Execute Mutation**: The actual mutation is executed using an `EXISTS` subquery correlation linked to the Temp Table.
4. **Re-Hydration**: The primary keys from the Temp Table are then used to fetch the resulting data.
5. **Cleanup**: The Temp Table is automatically dropped when the transaction completes.

**Example (MySQL Batch Update):**
```sql
START TRANSACTION;
-- 1. Create a lightweight temporary table
CREATE TEMPORARY TABLE _tmp_castor_123 AS SELECT id FROM users WHERE 1=0;

-- 2. Snapshot the targeted IDs based on the complex filter
INSERT INTO _tmp_castor_123 (id) 
SELECT users.id FROM users WHERE users.age > 18;

-- 3. Execute the mutation securely against the snapshot
UPDATE users SET status = 'active' 
WHERE EXISTS (SELECT 1 FROM _tmp_castor_123 WHERE _tmp_castor_123.id = users.id);

-- 4. Re-hydrate results using the snapshot
SELECT ... FROM users LEFT JOIN profiles ... 
INNER JOIN _tmp_castor_123 sq ON users.id = sq.id;

-- 5. Cleanup
DROP TEMPORARY TABLE IF EXISTS _tmp_castor_123;
COMMIT;
```

### Split Queries Strategy (Pagination & Hydration)
When joining multiple one-to-many relationships, native ORMs often suffer from Cartesian fan-out, making pagination (`LIMIT`/`OFFSET`) inaccurate.
- `drizzle-castor` uses a **CTE (Common Table Expression) Split Query Strategy** (`buildSearchQueries`).
- Query 1 (CTE): Fetches exactly the requested paginated base IDs using filters and grouping.
- Query 2 (Outer Query): `INNER JOIN`s the primary query against the CTE results to safely hydrate relationships without losing pagination accuracy.

**Example (Paginated Search with One-to-Many Joins):**
```sql
-- Query 1 (CTE): Determine exactly which 10 users to fetch
WITH "sq" AS (
  SELECT "users"."id", "users"."created_at" AS __order_0 
  FROM "users" 
  WHERE "users"."role" = 'admin'
  GROUP BY "users"."id"
  ORDER BY "users"."created_at" DESC
  LIMIT 10 OFFSET 0
)
-- Query 2 (Main Query): Hydrate the full graph for only those 10 users
SELECT "users"."id", "posts"."title", "posts"."content"
FROM "users"
INNER JOIN "sq" ON "users"."id" = "sq"."id"
LEFT JOIN "posts" ON "users"."id" = "posts"."user_id"
ORDER BY "sq".__order_0 DESC;
```

---

## 5. Function Call Graphs

Understanding the exact sequence of function execution helps to debug and extend the library. Below are the call graphs for a complex Read operation (`searchPage`) and a complex Batch Mutation (`updateMany`).

### A. Call Graph: `searchPage`
This function executes the Split Queries strategy for safe, paginated reads.

```text
[Public API] repo.searchPage(query, profile)
 └── [Middleware] executeWithMiddleware("read", ...)
      └── [Context] runInContext(...)
           └── [Pipeline] composeMiddleware(...) -> unified-rbac (Trims unpermitted fields)
                └── [Executor] executeSearchPage(ctx)
                     ├── [Helper] injectSoftDeleteFilter(...) -> Appends active status logic
                     ├── [AST Compiler] buildSearchQueries(query, ctx, isPaginated: true)
                     │    ├── [Analyzer] analyzeQuery(...) -> Identifies relation paths
                     │    ├── [Alias Manager] buildAliases(...) -> Generates CTE & Outer table aliases
                     │    ├── [AST Compiler] parseOrder(...) -> Builds ORDER BY AST
                     │    ├── [AST Compiler] applyJoins(...) -> Builds JOINs for CTE Query
                     │    ├── [AST Compiler] parseFilter(...) -> Builds WHERE AST for CTE Query
                     │    ├── [AST Compiler] buildSelection(...) -> Builds SELECT payload for Main Query
                     │    └── [AST Compiler] applyJoins(...) -> Builds JOINs for Main Query
                     ├── [Drizzle ORM] execute(countQuery) -> Fetches totalItems
                     ├── [Drizzle ORM] execute(mainQuery) -> Fetches paginated, unhydrated rows
                     └── [AST Compiler] hydrateResults(...) -> Collapses flat rows into nested JSON objects
 ◄── [Return] { data: [...], meta: { totalItems, totalPages... } }
```

### B. Call Graph: `updateMany`
This function handles batch mutations securely, employing dialect-specific transaction strategies.

```text
[Public API] repo.updateMany(filter, set, profile)
 └── [Middleware] executeWithMiddleware("update", ...)
      └── [Context] runInContext(...)
           └── [Pipeline] composeMiddleware(...) -> unified-rbac (Trims unpermitted fields)
                └── [Executor] executeUpdateMany(ctx)
                     ├── [AST Compiler] parseUpdateSet(...) -> Transforms dot-notation to SQL JSON functions
                     ├── [Helper] injectSoftDeleteFilter(...) -> Appends active status logic
                     └── [Executor] executeBatchMutation(ctx, baseTable, pkName, mutationFn, filter)
                          ├── [Dialect] supportsReturning(db)
                          │
                          │   ================ STRATEGY A (PG/SQLite) ================
                          ├── [Drizzle ORM] db.transaction(tx => ...)
                          │    ├── [AST Compiler] buildExistsCondition(filter) -> Bypasses `IN` limitations
                          │    │    ├── [Analyzer] analyzeQuery(...)
                          │    │    ├── [Alias Manager] buildAliases(..., "sub")
                          │    │    ├── [AST Compiler] applyJoins(...)
                          │    │    └── [AST Compiler] parseFilter(...)
                          │    ├── [Drizzle ORM] tx.update().set().where(existsCondition).returning()
                          │    ├── [AST Compiler] buildSearchQueries(rehydrateQuery) -> Re-fetch relations
                          │    ├── [Drizzle ORM] execute(mainQuery)
                          │    └── [AST Compiler] hydrateResults(...)
                          │
                          │   ================ STRATEGY B (MySQL) ====================
                          └── [Drizzle ORM] db.transaction(tx => ...)
                               ├── [Dialect] generateTempTableName()
                               ├── [Drizzle ORM] tx.execute(CREATE TEMPORARY TABLE ...)
                               ├── [AST Compiler] buildExistsCondition(filter)
                               ├── [Drizzle ORM] tx.execute(INSERT INTO temp_table SELECT ... WHERE existsCondition)
                               ├── [Drizzle ORM] tx.update().set().where(EXISTS (SELECT FROM temp_table))
                               ├── [AST Compiler] buildSearchQueries(rehydrateQuery)
                               ├── [Drizzle ORM] mainQuery.innerJoin(temp_table) -> Safely constrain to updated IDs
                               ├── [Drizzle ORM] execute(hydrationQuery)
                               ├── [AST Compiler] hydrateResults(...)
                               └── [Drizzle ORM] tx.execute(DROP TEMPORARY TABLE)
 ◄── [Return] Array of hydrated updated objects
```
