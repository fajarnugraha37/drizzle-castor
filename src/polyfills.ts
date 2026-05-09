/**
 * Polyfills for cross-environment compatibility.
 * Specifically handles libraries that assume Bun global variables.
 */
export function applyPolyfills(target: any): void {
  if (typeof target.Bun === "undefined") {
    target.Bun = { RedisClient: class {} };
  }
}

// Auto-apply to globalThis for default behavior
applyPolyfills(globalThis);
