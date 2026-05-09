/**
 * Helper to check if a mutation result indicates success.
 * Strict check: must be a non-empty array or a positive number.
 * Standardized across all mutation executors.
 */
export function isMutated(result: any[] | number | null | undefined): boolean {
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === "number") return result > 0;
  return false; // Explicitly reject any other values
}
