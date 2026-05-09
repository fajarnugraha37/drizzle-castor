# Architecture Guide: Advanced TypeScript Type System

This document serves as the technical blueprint and handover manual for the type inference engine. The system is designed to achieve extreme type safety for relational database structures and nested JSON types while maintaining high performance for IDE IntelliSense and build times.

## 1. Type Isolation via the Factory Pattern
The core engine follows an "Inference on Demand" strategy to prevent the compiler from becoming overwhelmed by large schemas.

- **Objective:** Prevent the compiler from re-evaluating the entire table relationship tree for every repository method.
- **Pattern:** Heavily recursive logic is moved into isolated "Define" functions.
- **Methods:** `defineProjection`, `defineFilter`, `defineQuery`, `defineUpdateSet`, and `defineInsertValue`.
- **Recommendation:** Always encourage developers to use these helpers for complex or deep nested queries. They act as "Inference Firewalls."

## 2. Recursive Depth Management
Recursive types are controlled via tail-recursive counters to prevent "excessively deep instantiation" errors.

- **Object Tree (InferEntity):** Capped at 10 levels. This manages the structural relationship between tables.
- **String Unions (FlattenPaths):** Capped at 5 levels. String operations are significantly more memory-intensive; strict capping ensures the literal pool remains manageable.
- **Counter Pattern:**
```typescript
type Prev = [never, 0, 1, 2, 3, 4, 5];
type RecursiveType<T, Depth extends number = 5> = [Depth] extends [never]
  ? never
  : { [K in keyof T]: RecursiveType<T[K], Prev[Depth]> };
```

## 3. Optimized Path Resolution (ValueAt)
Path resolution uses a Key-First Lookup strategy to minimize string parsing overhead.

- **Strategy:** Direct property lookup (`T[K]`) is tried first. The compiler only proceeds to template literal splitting (`${infer K}.${infer R}`) if the direct lookup fails.
- **Benefit:** Reduces the number of recursive jumps the compiler must take when validating paths like `a.b.c.d.e`.

## 4. Relationship Directionality and Constraints
Type constraints must strictly mirror SQL foreign key logic.

- **oneToMany:** `localKey` (Parent) -> `foreignKey` (Child).
- **manyToOne:** `localKey` (Child) -> `foreignKey` (Parent).
- **Type Widening Prevention:** Use the `const` parameter pattern in builder methods to preserve string literals.
```typescript
// Prevents "users" from being widened to just "string"
function table<const T extends TableConfig>(config: T)
```

## 5. Intrinsic Safety and Nullability
Database schemas often return nullable columns which block the `infer` keyword.

- **The Guard:** Always wrap inference targets in `NonNullable<T>` before attempting to extract types.
```typescript
// Correct pattern for array element inference
export type LeafType<T> = NonNullable<T> extends ReadonlyArray<infer U> 
  ? NonNullable<U> 
  : NonNullable<T>;
```

## 6. Autocomplete Preservation Trick
To allow arbitrary string keys while prioritizing suggestions for known literals (e.g., Profile Names), use the `(string & {})` intersection trick.

- **Concept:** `(string & {})` prevents literal types (like 'admin') from being merged into a generic `string` type during union reduction.
```typescript
type ProfileNames = 'admin' | 'public' | (string & {}); // Suggests admin/public first
```

## 7. Dynamic Result Shaping (DeepPick)
The `DeepPick` utility transforms the "Full Entity" type into a "Partial Entity" based on a runtime projection array.

- **Mechanism:** It recursively filters object properties against the union of strings provided in the projection. 
- **Optimization:** It uses a mapped type with a conditional `as` clause to filter out keys that do not match the requested path.

## 8. Metaprogramming Tips and Tricks

### A. Template Literal Path Stripping
When traversing a path like `user.profile.bio`, use recursive inference to strip the head:
```typescript
type Tail<P extends string> = P extends `${string}.${infer Rest}` ? Rest : never;
```

### B. Readonly-Aware Inference
Always prefer `ReadonlyArray<infer U>` over `Array<infer U>`. Modern TypeScript development uses `as const` assertions frequently, which produce `readonly` arrays. Standard `Array` inference will fail on these.

### C. Intersection Merging (Clean Output)
Builder patterns accumulate types using intersections (`A & B & C`). To make the IDE show a single merged object instead of a messy intersection, use a "Prettify" or "Expand" utility:
```typescript
type Expand<T> = T extends object ? { [K in keyof T]: T[K] } : T;
```

### D. Distributed Conditional Types
Be aware that `T extends any` will distribute the operation across a union. Use `[T] extends [any]` to disable distribution when you need to treat a union as a single unit.

## 9. Performance Auditing
If the IDE becomes slow:
1. Reduce the `FlattenPaths` depth from 5 to 4 or 3.
2. Check if a new table has an extremely large number of columns or complex JSON types.
3. Ensure no circular relations are missing the depth counter.
