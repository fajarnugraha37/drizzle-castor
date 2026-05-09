# Project Architecture Blueprint: Drizzle-Castor

**Date Generated**: May 10, 2026
**Project Type**: TypeScript / Node.js (Bun) Library
**Architecture Pattern**: Data Access Abstraction Layer / Middleware-Driven Repository

This document serves as a definitive reference for maintaining architectural consistency within the `drizzle-castor` codebase. It outlines the foundational design decisions, component boundaries, and implementation patterns used to build this robust, type-safe CRUD wrapper for Drizzle ORM.

---

## 1. Architecture Detection and Analysis
The project is a TypeScript-based library built with Bun, acting as a high-level wrapper and Data Access Object (DAO) abstraction over `drizzle-orm`. The architectural pattern relies heavily on:
- **Modular Repositories**: Dynamically generated through a factory (`repoFactory`).
- **Middleware Pipeline**: An extensible pipeline handling security (Unified RBAC) and cross-cutting concerns around all database actions.
- **AST Parsing and Query Building**: Abstracted filtering (`QueryParser`, `AST Compiler`) mapped down to Drizzle's SQL operators.

## 2. Directory Structure
The repository is organized into distinct domain boundaries to separate concerns between the public API, context execution, AST translation, and database dialect management.

```text
├───example/                     # Playground and edge-case testing area
├───src/                         # Main library source code
│   ├───context/                 # Execution context manager (Thread-local state)
│   ├───errors/                  # Custom error classes (Security, Parsing, Mutation)
│   ├───helper/                  # Shared utilities (Dialect, Assertions, Types)
│   ├───middleware/              # Koa-style pipeline and Unified RBAC engine
│   ├───mutations/               # Physical executors for INSERT, UPDATE, DELETE
│   ├───queries/                 # Physical executors for SELECT and Hydration
│   ├───query-parser/            # AST Translators (JSON -> Drizzle SQL)
│   │   ├───alias-manager.ts     # Handles SQL aliasing for JOINs
│   │   ├───ast-compiler.ts      # Translates filter/order/select payloads
│   │   ├───filter-builder.ts    # Recursive $and/$or operator evaluator
│   │   └───json-resolver.ts     # Dialect-specific JSON path handling
│   ├───types/                   # TypeScript interfaces and global definitions
│   ├───schema-metadata.ts       # Repository factory implementation
│   └───index.ts                 # Public API exports
└───tests/                       # Test suites
    ├───integration/             # Dialect-specific testing (PG, MySQL, SQLite)
    └───unit/                    # Isolated module testing via Bun
```

## 3. Architectural Overview
`drizzle-castor` provides a structured, middleware-augmented Repository Pattern on top of Drizzle ORM. 

**Guiding Principles**:
- **Type Safety**: Leverage TypeScript generics to provide end-to-end type safety from database schema to query results.
- **Extensibility**: Expose a generic middleware execution pipeline around all DB interactions.
- **Security by Default**: Provide a built-in Unified RBAC (Role-Based Access Control) to gatekeep actions inherently at the repository layer.
- **Dialect Agnosticism**: Abstract operations to work across PostgreSQL, MySQL, and SQLite safely (e.g., using specific returning strategies vs. temporary tables fallback for race conditions).

## 3. Architecture Visualization
*(Textual representation of component flow)*

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
[ Drizzle ORM ] -> [ Database ]
```

## 4. Core Architectural Components

### A. Schema Metadata Builder (`defineSchemaMetadata`)
- **Purpose**: Acts as the root bootstrap mechanism that binds the Drizzle instance and table schemas into a factory capable of producing bound Repositories.
- **Internal Structure**: Instantiates global context, registers global middleware, initializes policies, and returns the `repoFactory`.

### B. Repository Factory (`repoFactory`)
- **Purpose**: Creates type-safe CRUD interfaces tailored to a specific base table.
- **Interaction Patterns**: Routes generic method calls (e.g., `searchOne`, `updateOne`) through the composed `Middleware` pipeline into specific executor functions.

### C. Execution Context (`ExecutionContext`)
- **Purpose**: Encapsulates the entire scope of a single database transaction/request, carrying context variables, execution parameters, translator configurations, and telemetry hooks.

### D. Query Parser & AST Compiler
- **Purpose**: Translates high-level, JSON-like query syntax (e.g., nested `$and`, `$or`, relationship inclusions) into raw Drizzle SQL statements and join configurations.
- **Interaction Patterns**: Extensively used by executors before executing physical queries. Handles aliasing, json extraction, and soft-delete conditionals dynamically.

### E. Executors (`mutations/`, `queries/`)
- **Purpose**: The final physical layer that interacts with `drizzle-orm` functions.
- **Evolution Patterns**: Contains highly specialized strategies depending on database dialect support (e.g., using `RETURNING` clauses in PG/SQLite vs. temporary tables in MySQL for transaction safety).

## 5. Architectural Layers and Dependencies
1. **API Layer**: `index.ts`, exporting types and factory functions.
2. **Context & Middleware Layer**: Wraps executions, validates RBAC.
3. **AST Translation Layer**: Converts abstract operations into concrete Drizzle constructs.
4. **Execution Layer**: Runs the actual Drizzle ORM queries and hydrates the results.

*Dependency Rule*: Outer layers (Middlewares) can access Context and Executors, but Executors should not rely on Middleware logic. AST Translators act as pure functions utilized by Executors.

## 6. Data Architecture
- **Data Mapping**: Abstract filters and projections are mapped to physical tables using `schema-metadata`. 
- **Relationships**: Automatically resolved via nested path expressions, converting conceptual relationships into SQL `JOIN`s on the fly.
- **Soft Deletion**: Baked directly into AST generation. When relations or base queries are built, active soft-delete filters are injected implicitly.

## 7. Cross-Cutting Concerns Implementation

### Authentication & Authorization
- **Implementation**: Handled entirely via `createUnifiedRbacMiddleware`. Policies are defined on a per-table or global basis.
- **Pattern**: Middleware intercepts the action type (`create`, `read`, `update`, etc.) and the user profile, querying the policy definition before allowing the executor to run.

### Error Handling & Resilience
- **Implementation**: Specific error classes (`MutationError`, `QueryParsingError`, `SecurityError`).
- **Pattern**: Thrown internally and optionally caught or propagated. Strict race-condition protection is applied using transaction-bound Temporary Tables (MySQL) or `RETURNING` clauses.

### Logging & Monitoring
- **Implementation**: Telemetry is gathered via `telemetrySubscribers` set on the translator context, wrapping execution context lifecycle events (`runInContext`).

## 8. Service Communication Patterns
As a library, communication is primarily synchronous function invocation. Asynchronous patterns are utilized exclusively for physical database I/O (`Promises` over Drizzle async executors).

## 9. Technology-Specific Architectural Patterns
### TypeScript / Bun / Node.js
- **Module Organization**: Modular directories (`mutations`, `queries`, `middleware`, `query-parser`).
- **Dependency Injection**: Context is passed explicitly via `ExecutionContext` rather than using complex DI frameworks, maintaining high performance and clear execution traces.

## 10. Implementation Patterns
- **Service Implementation**: The `repoFactory` acts as a proxy/facade exposing strongly typed methods that delegate to standalone executors (`executeCreateOne`, `executeSearchMany`).
- **Interface Design**: High reliance on type inference and complex TypeScript generics to ensure that query parameters (filters, select fields) match the underlying Drizzle schema exactly.
- **Concurrency Handling**: Managed at the dialect level. Specific `single-executor.ts` strategy ensures that updates/deletes securely capture the modified rows without race conditions.

## 11. Testing Architecture
- **Strategy**: 
  - **Integration Tests**: Grouped by dialect (`postgresql`, `mysql`, `sqlite`) using `testcontainers` to ensure AST logic maps correctly to real DB constraints.
  - **Unit Tests**: Grouped by internal modules (`query-parser`, `middleware`, `errors`) run natively via Bun's isolated test runner.

## 12. Deployment Architecture
- **Packaging**: Distributed as an NPM module. Compiled using `tsc` and bundled using `tsup`. Supports ESM and CJS natively through robust `package.json` export mapping.

## 13. Extension and Evolution Patterns
- **Feature Addition**: New AST operators or filters should be added purely within `src/query-parser/operator-builder.ts` or `filter-builder.ts`.
- **Middleware Integration**: Consumers can inject custom middleware through `defineSchemaMetadata` to handle multi-tenant isolation, specific auditing, or custom logging without modifying core library code.

## 14. Architectural Pattern Examples

### Middleware Pipeline Example
```typescript
// composeMiddleware iterates through layers, maintaining 'ctx' flow.
const pipeline = composeMiddleware([
  ...applicableMiddlewares,
  unifiedRbacMiddleware
]);
const result = await pipeline(ctx, async () => {
  return coreFn(ctx);
});
```

### Context-Driven Execution
```typescript
return runInContext({ action, tableName, profile, params, translatorContext }, async () => {
    const ctx = useExecutionContext();
    return executeSearchOne(ctx);
});
```

## 15. Architectural Decision Records (Implicit)
- **ADR: Strict Separation of Dialects**:
  - *Context*: MySQL lacks robust `RETURNING` support in all required contexts.
  - *Decision*: Adopt a bifurcated mutation execution strategy (`executeSingleMutation`), using pure `RETURNING` for PG/SQLite and Temporary Tables for MySQL.
  - *Consequences*: Guarantees data consistency across dialects at the cost of slightly higher complexity in the executor module.
- **ADR: Middleware Over Direct Hooks**:
  - *Context*: Users needed ways to hook into CRUD lifecycles.
  - *Decision*: Adopted an Express-like middleware pattern (Koa/Express style `(ctx, next) => ...`) wrapped around the executor.

## 16. Architecture Governance
- Maintained via strict TypeScript configurations (`strict: true`, `noImplicitOverride: true`).
- Enforced file constraints via `.gemini.md` constraints (Max 300 lines per file, strict DRY).
- Monitored by robust integration testing against live DB containers before PR merges.

## 17. Blueprint for New Development
**To add a new feature (e.g., a new Query Filter Operator):**
1. Define the type signature in `src/types/query.ts`.
2. Add the translation logic in `src/query-parser/operator-builder.ts`.
3. Add Unit Tests in `tests/unit/query-parser/operator-builder.test.ts`.
4. Ensure Integration Tests (`tests/integration/*/read.test.ts`) assert the new operator correctly across PG, MySQL, and SQLite.
5. Respect the 300-line limit: if the parser grows too large, extract the logic into a new sub-module helper.