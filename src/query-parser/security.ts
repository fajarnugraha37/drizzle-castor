/**
 * Asserts that a given key is not a dangerous prototype property.
 * Used to prevent Prototype Pollution vulnerabilities.
 * 
 * @param key The key to check
 * @param context Information about where the error occurred for debugging
 */
export function assertSafeKey(key: string, context: string): void {
  if (key === "__proto__" || key === "constructor" || key === "prototype") {
    throw new Error(`Security Error: Illegal key '${key}' in ${context}`);
  }
}
