# Plan 001: Runtime Query Translator (AST Compiler)

## 1. Objective
Build a robust, type-safe Runtime Query Translator that converts `SearchQuery` objects (using dot-notation) into highly optimized Drizzle ORM execution logic. The translator must support deep-nested filtering, sorting, and projection without suffering from Cartesian fan-out pagination issues.

## 2. Architectural Blueprint
Based on architectural analysis, the query translator will implement the following strategies:

1.  **Engine:** Drizzle Core Query Builder (`db.select()`, `db.$with()`).
2.  **Aliasing Strategy:** **Path-Based Aliasing** (e.g., path `posts.comments` becomes alias `rel_posts_comments`).
3.  **Pagination Strategy:** **CTE (Common Table Expressions) / Subquery**.
    *   **CTE (Phase 1):** Resolves Filters, Order, and Limit/Offset to return a paginated list of Base Entity IDs.
    *   **Outer Query (Phase 2):** Re-joins the paginated IDs with the Base Table and resolving Projections (Hydration).
4.  **JOIN Separation Rules:**
    *   *Rule A (Inner Joins):* Paths used in `filter` or `order` MUST be joined inside the CTE.
    *   *Rule B (Outer Joins):* Paths used ONLY in `projection` MUST be joined in the Outer Query.
5.  **Smart Aggregation Order:** If `order` targets an array relation (One-To-Many/Many-To-Many), the translator automatically injects an aggregation function (`MIN` for ASC, `MAX` for DESC) and forces the CTE to use `GROUP BY` instead of `DISTINCT`.

## 3. Technical Constraints & Standards
*   **TypeScript Rigor:** Strict typing, zero `any` tolerance for public interfaces.
*   **Industry Best Practices:** SOLID principles, Separation of Concerns (SoC), DRY (Don't Repeat Yourself), and KISS (Keep It Simple, Stupid).
*   **Modularity:** Logic must be heavily decentralized.
*   **File Size Limit:** NO file shall exceed **300 lines**.
*   **No DIY:** Leverage existing libraries (like `lodash-es` for object manipulation or `defu` for merging) if reinventing the wheel is counterproductive.

## 4. Proposed Module Structure
To adhere to the < 300 lines limit and SoC, the implementation will be split into a new directory `src/query-parser/`:

*   `src/query-parser/index.ts`: The Facade. Exposes the main `translateQuery` function.
*   `src/query-parser/analyzer.ts`: Parses the `SearchQuery` object. Extracts unique paths and categorizes them into `ctePaths` (Rule A) and `outerPaths` (Rule B). Determines if `GROUP BY` is needed based on ordering.
*   `src/query-parser/alias-manager.ts`: Utility for generating deterministic table aliases and managing Drizzle `alias()` instances.
*   `src/query-parser/operator-builder.ts`: Maps custom operators (`$eq`, `$ilike`, `$and`, etc.) into Drizzle AST functions (`eq`, `ilike`, `and`).
*   `src/query-parser/ast-compiler.ts`: Assembles the final Drizzle query using the CTE, injecting the dynamically built `leftJoin`, `where`, and `orderBy` clauses.
*   `src/query-parser/hydrator.ts`: Maps the flat SQL result rows back into the desired nested JSON structure based on the `projection`.

## 5. Implementation Plan

*   **Step 1: Scaffolding & Analysis Logic**
    *   Create the directory structure.
    *   Implement `analyzer.ts` to recursively extract paths from `SearchQuery` and apply the separation logic.
*   **Step 2: Drizzle Operator Mapping**
    *   Implement `operator-builder.ts` to safely translate NoSQL-like syntax into Drizzle functions.
*   **Step 3: CTE & AST Assembly**
    *   Implement `alias-manager.ts`.
    *   Implement `ast-compiler.ts` that stitches together the `$with` CTE and the main `select`.
*   **Step 4: Result Hydration**
    *   Implement `hydrator.ts` to unflatten the result.
*   **Step 5: Integration**
    *   Wire everything together in `index.ts`.
    *   Update `ROADMAP.md` to mark this phase as "In Progress" or "Completed".

## 6. Expected Output
A fully functional `QueryParser` module that can be injected into the currently stubbed `repoFactory` (specifically for `searchPage` and `searchMany` methods). It should successfully translate a complex nested `SearchQuery` into an optimized, single-trip CTE SQL query without crashing the TS Compiler or producing overly large files.