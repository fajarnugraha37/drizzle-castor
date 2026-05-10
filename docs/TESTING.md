# Testing in Drizzle-Castor

This document outlines the testing strategy, tools, and methodologies used to ensure the reliability, security, and multi-dialect compatibility of the `drizzle-castor` library.

---

## 1. Testing Philosophy

Because `drizzle-castor` functions as a database abstraction and AST translator, ensuring correctness across different SQL dialects (PostgreSQL, MySQL, SQLite) is paramount. The testing strategy is strictly divided into two layers:

1.  **Unit Tests**: Fast, isolated tests focusing on pure business logic, AST compilation, and RBAC rules without any real database connection.
2.  **Integration Tests**: Comprehensive, dialect-specific tests executing against real, live databases to ensure SQL generation and transaction mechanics function properly under real-world constraints.

---

## 2. Tools & Frameworks

The library uses a modern, lightweight testing stack:

-   **[Bun Test](https://bun.sh/docs/cli/test)**: Used for all Unit tests and the SQLite Integration tests. It is extremely fast and provides built-in isolation.
-   **[Node.js Native Test Runner](https://nodejs.org/api/test.html) (`node:test`)**: Used for PostgreSQL and MySQL Integration tests.
-   **[Testcontainers](https://testcontainers.com/)**: Used in the Node test runner to spin up ephemeral, disposable Docker containers for PostgreSQL and MySQL instances.
-   **`expect`**: Used for assertions in the Node tests to maintain a Jest-like assertion syntax.

---

## 3. Test Structure

Tests are located in the `/tests` directory and follow a strict boundary:

```text
└───tests/
    ├───integration/             # Tests requiring a live database connection
    │   ├───mysql/               # MySQL tests (Node + Testcontainers)
    │   ├───postgresql/          # PostgreSQL tests (Node + Testcontainers)
    │   └───sqlite/              # SQLite tests (Bun + in-memory SQLite)
    └───unit/                    # Pure logic testing (Bun)
        ├───context/
        ├───errors/
        ├───helper/
        ├───middleware/
        ├───mutations/
        └───query-parser/
```

---

## 4. Running the Tests

The `package.json` provides specific scripts for executing different test suites.

### A. Unit Tests
Runs the isolated test suite using Bun. This is fast and should be run continuously during development.

**Best Practice:** Always use the `--isolate` flag when running the full suite to prevent side-effects from global state (like the metadata resolution cache) leaking between test files.

```bash
# Run all unit tests with isolation
bun test --isolate

# Run unit tests in watch mode
bun run test:watch
```

#### What to Test
- **AST Compiler**: Verify that JSON payloads translate to correct SQL snippets.
- **Middleware**: Ensure policies are applied, fields are trimmed, and `next()` is called appropriately.
- **Telemetry**: Assert that `execution`, `security`, and `error` events are emitted with the expected payloads.
- **Logger**: Verify that custom patterns are correctly formatted and context is injected.

### B. Integration Tests (SQLite)
Runs the SQLite integration tests. These are executed by Bun using its blazing-fast, built-in in-memory SQLite driver (`bun:sqlite`).

```bash
bun run test:sqlite
```

### C. Integration Tests (PostgreSQL & MySQL)
Runs the dialect-specific tests using the native Node Test runner alongside Testcontainers. 

*Note: You must have a working Docker daemon running on your host machine to execute these tests.*

```bash
# Run PostgreSQL integration tests (Node Test Runner + Testcontainers)
node --import tsx --test .\tests\integration\postgresql\*.test.ts

# Run MySQL Integration Tests (Node Test Runner + Testcontainers)
node --import tsx --test .\tests\integration\mysql\*.test.ts
```

---

## 5. Writing Tests

### Unit Tests
When adding features to the AST compiler, middleware, or context manager, add tests inside `tests/unit/*`.
-   Use `describe`, `test`, and `expect` from `"bun:test"`.
-   Do not connect to a database. Mock the schema or alias map if needed.

```typescript
// Example: tests/unit/middleware/middleware.test.ts
import { expect, test, describe } from "bun:test";
import { composeMiddleware } from "../../../src/middleware/middleware";

describe("composeMiddleware", () => {
  test("Catches synchronous errors", async () => {
    // ... setup
    await expect(pipeline(ctx, async () => "success")).rejects.toThrow();
  });
});
```

### Integration Tests
When adding new AST operators (e.g., `$like`), changing JSON extraction logic, or altering mutation strategies, you **must** write or update integration tests for all three dialects.

1.  **PostgreSQL & MySQL**: Use `node:test`. Setup the `PostgreSqlContainer` or `MySqlContainer` in the `before()` hook, and tear them down in `after()`.
2.  **SQLite**: Use `bun:test` and `bun:sqlite` with the `:memory:` database.

```typescript
// Example: tests/integration/postgresql/create.test.ts
import { describe, test, before } from "node:test";
import { expect } from "expect";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
// ... setup db and schema

describe("PostgreSQL Integration", () => {
  test("should create a record and hydrate relations", async () => {
     // ... execute creation
     // ... assert against the database
  });
});
```

## 6. Playground Testing

For manual validation of TypeScript typings or quick prototyping, use the `example/` directory.

```bash
# Seed the example SQLite database
bun run example:seed

# Run the playground script
bun run example:main -p
```