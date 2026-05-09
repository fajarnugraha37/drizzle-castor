/**
 * Polyfills for cross-environment compatibility.
 * Specifically handles libraries that assume Bun global variables.
 */
if (typeof (globalThis as any).Bun === "undefined") {
  (globalThis as any).Bun = { RedisClient: class {} };
}
