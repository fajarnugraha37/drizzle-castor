# Drizzle-Castor

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.30+-green.svg)](https://orm.drizzle.team/)

`drizzle-castor` is a robust, type-safe CRUD library and Data Access Object (DAO) abstraction designed to simplify database operations over [Drizzle ORM](https://orm.drizzle.team/). It provides a developer-friendly JSON-based querying syntax, an extensible middleware pipeline, unified Role-Based Access Control (RBAC), and safe multi-dialect execution strategies.

## Features

- **JSON-Based Querying (AST Translation)**: Filter, sort, and project relational data using intuitive JSON payloads (e.g., `{ filter: { "posts.title": { $like: "%Drizzle%" } } }`).
- **Dialect Agnostic**: Seamlessly supports PostgreSQL, MySQL, and SQLite. Handles complex dialect-specific logic under the hood (e.g., `RETURNING` clauses vs. Temporary Tables for atomic mutations).
- **Unified RBAC**: Built-in, middleware-driven Role-Based Access Control. Secure operations at the action and field levels (Intelligent Data Trimming).
- **Native Soft Deletes**: Declarative soft-delete capabilities that implicitly apply safety filters to queries and joins.
- **Safe Pagination (Split Queries)**: Leverages Common Table Expressions (CTEs) to prevent Cartesian fan-out when paginating one-to-many relationships.

---

## Technology Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Runtime**: [Bun](https://bun.sh/) & Node.js
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Validation/Typing**: [Zod](https://zod.dev/)
- **Testing**: Bun Test, Node Test Runner, [Testcontainers](https://testcontainers.com/) (for integration tests)

---


## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+ or Node.js
- Database of your choice (SQLite PostgreSQL or MySQL) 

### Installation

```bash
bun add @fajarnugraha37/drizzle-castor drizzle-orm
```

### Quick Usage

> [!NOTE]
> For a more detailed guide on setup, relations, and policy definitions, please refer to the [Quick Start Guide](./QUICKSTART.md).

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createSchemaBuilder } from "@fajarnugraha37/drizzle-castor";
import { usersTable } from "./schema";

const db = drizzle("sqlite.db");

// 1. Initialize Builder
const builder = createSchemaBuilder(db, [usersTable] as const, "strict")
  .profiles(['admin'])
  .policies('users', {
    admin: { allowedActions: "*", allowedSets: "*", allowedProjections: "*", allowedFilters: "*" }
  });

const metadata = builder.build();

// 2. Create Repository
const userRepo = metadata.repoFactory("users");

// 3. Execute Type-Safe Queries
const results = await userRepo.searchMany({
  filter: { "name": { $eq: "John Doe" } }
}, "admin");
```

---

## Project

### Architecture
The library implements a **Middleware-Driven Repository Pattern** functioning as an Abstract Syntax Tree (AST) transpiler.

```text
[ Application Logic ]
        │
        ▼
[ Repository Interface ] (createOne, searchMany, etc.)
        │
        ▼
[ Middleware Pipeline ] (Execution Context, RBAC, Custom Plugins)
        │
        ▼
[ Executor Engine ] (single-executor, batch-executor)
        │ (Uses Query Parser for AST compilation)
        ▼
[ Drizzle ORM ] -> [ Database Engine ]
```

For detailed architectural diagrams and internal mechanics, refer to the following documentation:
- [Project Architecture Blueprint](./Project_Architecture_Blueprint.md)
- [How It Works](./HOW_IT_WORKS.md)
- [Coding Standards](./CODING_STANDARDS.md)

### Directory Structure
```text
├───src/                         # Main library source code
│   ├───context/                 # Execution context manager (Thread-local state)
│   ├───errors/                  # Custom error classes (Security, Parsing, Mutation)
│   ├───helper/                  # Shared utilities (Dialect, Assertions, Types)
│   ├───middleware/              # Koa-style pipeline and Unified RBAC engine
│   ├───mutations/               # Physical executors for INSERT, UPDATE, DELETE
│   ├───queries/                 # Physical executors for SELECT and Hydration
│   ├───query-parser/            # AST Translators (JSON -> Drizzle SQL)
│   ├───types/                   # TypeScript interfaces and global definitions
│   ├───schema-metadata.ts       # Repository factory implementation
│   └───index.ts                 # Public API exports
└───tests/                       # Test suites
```

---

## Development Workflow & Testing

### Building the Project

The project uses `tsup` for bundling into ESM and CJS formats.

```bash
bun run build
```

### Testing

Testing is divided into isolated unit tests (via Bun) and integration tests against real databases (via Testcontainers).

```bash
# Run isolated Unit Tests (Bun)
bun run test --isolate

# Run PostgreSQL Integration Tests (Node Test Runner + Testcontainers)
node --import tsx --test .\tests\integration\postgresql\*.test.ts

# Run MySQL Integration Tests (Node Test Runner + Testcontainers)
node --import tsx --test .\tests\integration\mysql\*.test.ts

# Run SQLite Integration Tests
bun run test:sqlite
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Adhere to the "No God File" rule (files should not exceed 300 lines).
2. Do not bypass the internal AST generators or Executor strategies.
3. Any new filter operators must include corresponding unit and integration tests across all dialects.

---

## License

This project is licensed under the [MIT License](LICENSE).
