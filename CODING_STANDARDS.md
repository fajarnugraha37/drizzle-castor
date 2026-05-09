# Coding Standards

This document defines the syntax, style, and conventions used in the `drizzle-castor` project. All contributions should strictly follow these rules to maintain high code quality, consistency, and readability.

## 1. General Code Style

- **Language:** Strict TypeScript.
- **Clarity over Brevity:** Write code that is easy to read and understand.
- **Modularity:** Keep functions focused on a single responsibility. Extract reusable logic into helper functions.
- **No God Files:** Adhere to the strict constraint that a single file should not exceed 300 lines. Break down complex logic into smaller modules.
- **Immutability:** Favor immutability where possible, but use controlled mutations when necessary for performance (e.g., building ASTs).
- **Execution Context:** Never share state across asynchronous boundaries globally. Rely strictly on the `ExecutionContext` via the `runInContext` pipeline.

## 2. Naming Conventions

Use descriptive and meaningful names. Avoid ambiguous abbreviations.

| Item                           | Convention             | Example                             |
| ------------------------------ | ---------------------- | ----------------------------------- |
| Variables & Local Constants    | `camelCase`            | `baseTableName`, `resolvedSoftDelete`|
| Functions & Methods            | `camelCase`            | `executeSingleMutation()`, `parseFilter()`|
| Global Constants               | `UPPER_SNAKE_CASE`     | `CONJUNCTION_OPERATORS`             |
| Types, Interfaces & Classes    | `PascalCase`           | `ExecutionContext`, `ParsedOrder`   |
| Generics                       | `PascalCase` (Prefix T)| `TDb`, `TMetadata`                  |
| File Names                     | `kebab-case.ts`        | `ast-compiler.ts`, `json-resolver.ts`|

## 3. Formatting Rules

- **Indentation:** 2 spaces per indent.
- **Quotes:** Prefer double quotes (`"`) for standard strings. Use template literals (`` ` ``) for SQL query generation and string interpolation.
- **Semicolons:** Always required at the end of statements.
- **Trailing Commas:** Required in multiline object literals, array definitions, and function arguments.
- **Encoding:** UTF-8.

### Braces and Spacing

Use the K&R style (opening brace on the same line).

```typescript
// Correct
if (isFilterSimple(filter, metadata, baseTableName)) {
  return true;
} else {
  return false;
}

// Incorrect
if (isFilterSimple)
{
  return true;
}
```

- **Spacing:** One space after keywords (`if`, `for`, `while`). Space inside curly braces for objects `{ foo: "bar" }`.

## 4. TypeScript Specifics

- **Generics:** Use Generics extensively to enforce end-to-end type safety.
- **Type Exports:** Use `export type * from ...` to cleanly re-export types.
- **Interfaces vs Types:** Use `type` for unions, intersections, and mapped types. Use `interface` or `type` for object shapes, but be consistent within the module.
- **Explicit Types:** Provide explicit return types for complex functions or public API surfaces to improve TS compiler performance and readability.
- **`any` Usage:** Strictly limit the use of `any`. When writing highly generic AST compilers or ORM wrappers, use `any` only when TypeScript's type inference is fundamentally limited, but cast back to a known type as soon as possible.

## 5. Comments & Documentation

- **JSDoc:** Provide JSDoc block comments `/** ... */` for public exported functions and complex core logic. Describe the strategy and parameters.
- **Inline Comments:** Use `//` to explain *why* something is done, especially for non-obvious design decisions or dialect-specific workarounds.
- **Actionable Tags:** Use specific tags in comments to mark architectural decisions or bugs:
  - `// [DECISION]: Always use EXISTS strategy for batch mutations...`
  - `// FIX:` or `// BUG-X FIX:` for noting where a specific bug was resolved.
  - `// TODO:` for planned improvements.

## 6. Error Handling

- **Custom Error Classes:** Always throw specific, domain-aware error classes that extend `Error` (e.g., `MutationError`, `QueryParsingError`, `SecurityError`, `AccessDeniedError`, `ColumnNotFoundError`, `TableNotFoundError`).
- **Contextual Wrapping:** When catching errors from the database driver, wrap them in a custom error with additional context before rethrowing.

```typescript
try {
  const result = await mutationFn(tx, whereAst);
  return result;
} catch (error: any) {
  if (error instanceof MutationError) throw error;
  throw new MutationError(`Single mutation failed: ${error.message}`, error);
}
```

## 7. Tests

- **Integration Tests:** New features (especially AST translators and DB interactions) must include integration tests covering all supported dialects (`postgresql`, `mysql`, `sqlite`) using Testcontainers.
- **Unit Tests:** Pure logic (e.g., middleware routing, RBAC data trimming, string parsing) should be tested via isolated unit tests using Bun.
- **Coverage:** Aim for high coverage on core execution pathways. Ensure error-throwing pathways (e.g., `SecurityError`) are explicitly tested.

## 8. Changes to This Guide

This coding standards document reflects the current state of the `drizzle-castor` repository. As the project evolves, propose improvements to these standards by opening a PR updating this document.
