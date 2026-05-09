import { expect, test, describe } from "bun:test";
import { applyPolyfills } from "../../src/polyfills";

describe("Polyfills", () => {
  test("should define Bun.RedisClient if Bun is missing", () => {
    const mockGlobal: any = {};
    applyPolyfills(mockGlobal);
    
    expect(mockGlobal.Bun).toBeDefined();
    expect(mockGlobal.Bun.RedisClient).toBeDefined();
    expect(new mockGlobal.Bun.RedisClient()).toBeInstanceOf(Object);
  });

  test("should NOT overwrite existing Bun global", () => {
    const existingBun = { existing: true };
    const mockGlobal: any = { Bun: existingBun };
    applyPolyfills(mockGlobal);
    
    expect(mockGlobal.Bun).toBe(existingBun);
    expect((mockGlobal.Bun as any).RedisClient).toBeUndefined();
  });
});
