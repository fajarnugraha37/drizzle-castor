<h1 align="center">
  <a href="https://github.com/fajarnugraha37/drizzle-castor">
    <picture>
      <img height="500" alt="Drizzle Castor" src="https://raw.githubusercontent.com/fajarnugraha37/drizzle-castor/refs/heads/main/docs/drizzle-castor.png">
    </picture>
  </a>
</h1>
<p align="center">
    <em><b>drizzle-castor</b> is a type-safe CRUD library and Data Access Object (DAO) abstraction designed to simplify database operations over
      <b><a href="https://orm.drizzle.team/" target="_blank">Drizzle ORM</a></b>. It provides a JSON-based querying syntax, an extensible middleware pipeline, unified Role-Based Access Control (RBAC), and multi-dialect execution strategies.
    </em>
</p>

---

# Drizzle-Castor

[![NPM Version](https://img.shields.io/npm/v/@fajarnugraha37/drizzle-castor.svg)](https://www.npmjs.com/package/@fajarnugraha37/drizzle-castor)
[![JSR Version](https://jsr.io/badges/@fajar/drizzle-castor)](https://jsr.io/@fajar/drizzle-castor)
[![Bun](https://img.shields.io/badge/Bun-1.0+-green.svg)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.30+-green.svg)](https://orm.drizzle.team/)
[![SQLite](https://img.shields.io/badge/SQLite-3.9.0+-green.svg)](https://sqlite.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-green.svg)](https://www.postgresql.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8+-green.svg)](https://www.mysql.com/)

---

## Installation

You can install **Drizzle-Castor** from either **NPM** or **JSR** depending on your environment preference.

### Via NPM
Available under the `@fajarnugraha37` scope:

```bash
# Using bun (recommended)
bun add @fajarnugraha37/drizzle-castor

# Using npm
npm install @fajarnugraha37/drizzle-castor

# Using pnpm
pnpm add @fajarnugraha37/drizzle-castor

# Using yarn
yarn add @fajarnugraha37/drizzle-castor
```

### Via JSR
Available under the `@fajar` scope. Recommended for Deno or ESM-first projects:

```bash
# Using bun
bunx jsr add @fajar/drizzle-castor

# Using npx
npx jsr add @fajar/drizzle-castor

# Using deno
deno add jsr:@fajar/drizzle-castor
```

---

## Features

- **JSON-Based Querying (AST Translation)**: Filter, sort, and project relational data using intuitive JSON payloads (e.g., `{ filter: { "posts.title": { $like: "%Drizzle%" } } }`).
- **Unified RBAC Engine**: Built-in, middleware-driven Role-Based Access Control. Secure operations at the action and field levels (Intelligent Data Trimming) with support for **Declarative** (Map) and **Imperative** (Async Callbacks) policies.
- **Unified Middleware Pipeline**: Adopts the **Koa-style Onion Model** for absolute control flow (`await next()`) on every request.
- **Event-Driven Telemetry**: Integrated system using **`mitt`**. Emits structured, non-blocking events for execution performance, security audits, and data mutations.
- **Hybrid Logging**: Quarkus-style pattern-based logging powered by **`pino`**. Supports context injection (traceId, parameters) and nested object traversal in log patterns.
- **Dialect Agnostic**: Supports PostgreSQL, MySQL, and SQLite. Handles complex dialect-specific logic under the hood (e.g., `RETURNING` clauses vs. Temporary Tables for atomic mutations).
- **Native Soft Deletes**: Declarative soft-delete capabilities that implicitly apply safety filters to queries and joins.
- **Safe Pagination (Split Queries)**: Leverages Common Table Expressions (CTEs) to prevent Cartesian fan-out when paginating one-to-many or many-to-many relationships.

---

## Technology Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Runtime**: [Bun](https://bun.sh/) & Node.js
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Logging**: [Pino](https://getpino.io/)
- **Event Bus**: [Mitt](https://github.com/developit/mitt)
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

### Documentation

For detailed architectural diagrams and internal mechanics, refer to the following documentation:
- [Project Architecture Blueprint](./docs/ARCHITECTURE.md)
- [How It Works](./docs/HOW_IT_WORKS.md)
- [Coding Standards](./docs/CODING_STANDARDS.md)
- [Typescript Type](./docs/TYPE_SYSTEM.md)
- [Testing](./docs/TESTING.md)


### Quick Usage

> [!NOTE]
> For a more detailed guide on setup, relations, and policy definitions, please refer to the [Quick Start Guide](./docs/QUICKSTART.md).

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite";
import { createSchemaBuilder } from "@fajarnugraha37/drizzle-castor";
import { usersTable } from "./schema";

const db = drizzle("sqlite.db");

// 1. Initialize Builder
const builder = createSchemaBuilder(db, [usersTable] as const, "strict")
  .profiles(['admin', 'user'] as const) // Define valid profiles for type-safety
  .withLogger({ level: 'DEBUG', pattern: '%d [%p] (%t) %s' }) // Configure Hybrid Logger
  .policies('users', {
    admin: { allowedActions: "*", allowedProjections: "*", allowedFilters: "*" },
    user: async (ctx) => ({ allowedActions: ["read"], allowedProjections: ["name"] }) // Imperative policy
  });

// 2. Subscribe to Telemetry
builder.on('execution', (ev) => {
  console.log(`${ev.action} on ${ev.tableName} took ${ev.duration}ms`);
});

const metadata = builder.build();

// 3. Create Repository
const userRepo = metadata.repoFactory("users");

// 4. Execute Type-Safe Queries
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
