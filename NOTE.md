# Notes: TypeScript

This `library relies heavily on advanced features of the TypeScript Type System. Static type manipulation is used to achieve Extreme Type Safety and Inference on database relations (Relational API) and JSON types (NoSQL-like filtering).

Here are some critical guidelines, notes, and warnings to keep in mind when modifying or extending the core engine of this system:

## 1. Understand "Type Widening" and How to Prevent It
The most common problem when building a Builder Pattern or Factory Function in TypeScript is the loss of literal types (Literal Type Erasure / Type Widening).
* **Case:** When a developer defines a relation `relationName: "profile"`, TypeScript often infers the data type to be just a plain `string`, not the literal value `"profile"`.
* **Impact:** If TypeScript reads `"profile"` as a `string`, our type utilities (like `InferEntity` or `FlattenPaths`) won't know the exact name of the relationship. This breaks autocomplete and type-checking altogether.
* **Golden Solution:** Use a generic `const` parameter.
```typescript
// WRONG (Type Widening Affects)
table<TConfig extends TableConfig<...>>(config: TConfig)

// TRUE (Preserves String Literals)
table<const TConfig extends TableConfig<...>>(config: TConfig)
```

## 2. Recursion Depth Limit
TypeScript has a hard limit on how deep a type can be evaluated recursively (for example, when building a table tree). If you let it run indefinitely, the TypeScript compiler will throw an error: "Type instantiation is excessively deep and possibly infinite," and your VS Code will become very slow.
* Rule: Always use the array tuple `TDepth extends any[] = []` as a counter to stop the recursion at a certain depth (usually 3 or 4 levels is sufficient for database relations).
* Example in `helper.d.ts` (`InferEntity`):
```typescript
export type InferEntity<
TSchema, TTableName, TDepth extends any[] = []
> = TDepth["length"] extends 3
? InferModel<FindTable<TSchema["tables"], TTableName>> // Stop at depth 3
: InferModel<...> & { /* Continue relation inferring */ }
```

## 3. Strict Array Type Inference (`NonNullable`)
Drizzle ORM returns properties that can hold `null` values ​​(e.g., `string[] | null`). When attempting to extract the type of a single element from an array using the `infer` keyword, a union type (such as Nullable) will block the inference process and return the type `never`.
* **Impact:** Operators such as `$in` or `$arrayContains` will break and reject all input provided by the developer.
* **Solution:** Always wrap your inference target with `NonNullable<T>` before checking if it is an array.
* **Example in `query.ts` (`LeafType`):**
```typescript
// WRONG
export type LeafType<T> = T extends ReadonlyArray<infer U> ? U : T;

// TRUE
export type LeafType<T> = NonNullable<T> extends ReadonlyArray<infer U> ? NonNullable<U> : NonNullable<T>;
```

## 4. Type Constraints Must Be Explicit & Precise
Ensure that the relationship structure at the type level (`schema-metadata.d.ts`) exactly matches the structure rules at the SQL level (Database Schema).
* **manyToOne vs oneToMany:**
- In `oneToMany`: `localKey` (e.g., `users.id`) is in the parent table, and `foreignKey` (`posts.userId`) is in the related child table.
- In `manyToOne`: It's the other way around! `localKey` (`comments.postId`) is in the current table, and `foreignKey` (`posts.id`) is in the related table.
* **Typing Error:** If the type constraint (`StrictRelations`) forces the wrong orientation, the developer will be forced to write the configuration upside down. Even though TypeScript doesn't complain, our AST Compiler in runtime (`ast-compiler.ts`) will read those keys and construct the wrong/upside-down SQL `LEFT JOIN`.

## 5. Maintain "In-Memory Type Parsing" Through Generics
* Avoid aggressive casting like `as any` in your type architecture internally, unless there is absolutely no way around it (and even then only at the runtime execution level).
* Builder patterns like `SchemaBuilder` accumulate types using *intersection* (`TMetadata & { [K in TName]: TConfig }`). Make sure the final executer function (`.build()`) explicitly forces TypeScript to return the full union/intersection of that accumulation so that methods like `repoFactory` know exactly what the entire schema has been assembled with.

## 6. Dynamic Projection (`DeepPick`)
The type returned by a *repository* MUST ONLY contain properties explicitly requested by the *developer* via parameters.