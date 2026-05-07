# Roadmap for drizzle-crud

This roadmap outlines the strategic direction and upcoming implementation phases for the `drizzle-crud` Enterprise-Level Repository Builder & Headless CMS Engine.

## 1. Implement Runtime Query Translator (AST Compiler)
The most critical challenge is translating the type-safe dot-notation object queries into actual Drizzle ORM execution logic.

*   **Objective:** Build an isolated utility (e.g., `src/utils/query-parser.ts`) that parses the `SearchQuery`, `FilterQuery` (with operators like `$eq`, `$and`), and `OrderQuery`.
*   **Execution Strategy:** Decide between using the Drizzle Relational API (`db.query...`) or the Core Query Builder (`db.select().from().leftJoin()`). The Core Query Builder is likely required for advanced, deep-nested filtering and requires a dynamic Join Resolver to handle dot-notation paths (e.g., `author.profile.bio`).

## 2. Introduce Database Transaction Support
Enterprise applications require robust transaction management. The current `Repository` interface does not support passing a transaction context.

*   **Objective:** Modify the `Repository` methods and factory to be transaction-aware.
*   **Implementation:** Allow passing a transaction object (`tx`) alongside or instead of the main `db` instance. Consider patterns like `repo.withTransaction(tx).createOne(...)` or adding an optional `tx` argument to existing methods.

## 3. Implement Runtime Validation (Zod Integration)
While TypeScript provides compile-time safety, runtime validation is essential for a Headless CMS handling external inputs.

*   **Objective:** Integrate Zod (already in `package.json`) seamlessly into the architecture.
*   **Implementation:** Automatically generate or map Zod schemas from Drizzle schemas. Enforce validation on `TInsert` inputs before `Lifecycle Hooks` (like `beforeCreate` or `beforeUpdate`) are triggered.

## 4. Enhance Pagination Strategy (Cursor-Based Pagination)
The current `searchPage` method implies offset-based pagination (`offset`, `limit`, `total`), which suffers from performance degradation on massive datasets.

*   **Objective:** Provide scalable pagination mechanisms suitable for enterprise loads.
*   **Implementation:** Add support for **Keyset Pagination (Cursor-based)** alongside the existing offset approach to ensure performant deep-paging.

## 5. Setup Type Testing and Limit Verification
The complex type mechanics (`InferEntity`, `FlattenPaths`) rely heavily on recursion and string literal manipulation.

*   **Objective:** Ensure the TypeScript compiler does not fail ("Type instantiation is excessively deep and possibly infinite") as the schema grows.
*   **Implementation:** Establish a type-testing suite (using tools like `tsd` or `expect-type`). Create dummy schemas with 4-5 levels of relations to rigorously test the recursion limits and performance of the TypeScript compiler.

## Next Immediate Steps
1. Refactor `repoFactory` and interfaces to support Transactions.
2. Draft the `Query Parser` to handle basic `$eq` and `$and` conversions to Drizzle operators.
3. Begin replacing the `"Not implemented"` stubs in `repoFactory` with actual Drizzle runtime logic.