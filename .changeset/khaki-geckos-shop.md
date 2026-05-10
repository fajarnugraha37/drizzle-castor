---
"@fajarnugraha37/drizzle-castor": major
---

### WHAT is the breaking change?

The core execution engine has been refactored to use a context-aware transaction model. The `defineSchemaMetadata` and `CastorInstance` signatures have changed to support global transaction options and event emitters. Internal executors no longer accept manual database handles and instead rely on `AsyncLocalStorage` via the new Execution Context.

### WHY the change was made?

To provide a robust, enterprise-grade transaction system that supports propagation rules (like `REQUIRES_NEW` and `NESTED`) without requiring manual passing of transaction handles (`tx`) through every service layer. This simplifies complex business logic and ensures multi-dialect consistency (handling SQLite savepoints and MySQL atomic mutations transparently).

### HOW a consumer should update their code?

1.  **Remove Manual `tx` Passing**: If you were manually threading transaction objects to your repositories, you can now remove them. Simply wrap your operations in `castor.transaction(async (tx) => { ... })`.
2.  **Update Custom Middlewares**: If you have custom middlewares, ensure they interact with the `ctx` object provided by the pipeline, which now carries the `traceId` and transaction state.
3.  **Factory Re-initialization**: If you are using `defineSchemaMetadata` directly (not through `SchemaBuilder`), update your call site to match the new signature which includes telemetry and logger configuration.
