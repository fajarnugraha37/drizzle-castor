import { expect, test, describe, mock, beforeEach } from "bun:test";
import { 
  getContext, 
  setMetadata, 
  setState, 
  getState, 
  getSchemaConfig, 
  defaultTraceIdGenerator, 
  withTransaction 
} from "../../../src/helper/context-helper";
import { runInContext } from "../../../src/context/manager";
import { ConfigurationError } from "../../../src/errors";

describe("context-helper", () => {
  const mockTranslatorContext = {
    db: {
      transaction: mock(async (cb: any) => cb("mock-tx")),
    },
    metadata: {
      users: { some: "config" },
    },
    tables: [],
    baseTableName: "users",
  } as any;

  test("getContext returns the current context", async () => {
    await runInContext({
      action: "read",
      tableName: "users",
      translatorContext: mockTranslatorContext,
    }, async () => {
      const ctx = getContext();
      expect(ctx.action).toBe("read");
    });
  });

  test("setMetadata updates context metadata", async () => {
    await runInContext({
      action: "read",
      tableName: "users",
      translatorContext: mockTranslatorContext,
    }, async () => {
      setMetadata("userId", "123");
      const ctx = getContext();
      expect(ctx.metadata.userId).toBe("123");
    });
  });

  test("setState and getState manage internal state", async () => {
    await runInContext({
      action: "read",
      tableName: "users",
      translatorContext: mockTranslatorContext,
    }, async () => {
      setState("foo", "bar");
      expect(getState("foo")).toBe("bar");
    });
  });

  test("getSchemaConfig returns metadata for the current table", async () => {
    await runInContext({
      action: "read",
      tableName: "users",
      translatorContext: mockTranslatorContext,
    }, async () => {
      expect(getSchemaConfig()).toEqual({ some: "config" });
    });
  });

  describe("defaultTraceIdGenerator", () => {
    test("generates a random string", () => {
      const id1 = defaultTraceIdGenerator();
      const id2 = defaultTraceIdGenerator();
      expect(typeof id1).toBe("string");
      expect(id1.length).toBeGreaterThan(5);
      expect(id1).not.toBe(id2);
    });

    test("uses crypto.randomUUID if available", () => {
      const originalCrypto = globalThis.crypto;
      // @ts-ignore
      globalThis.crypto = { randomUUID: () => "fixed-uuid" };
      expect(defaultTraceIdGenerator()).toBe("fixed-uuid");
      globalThis.crypto = originalCrypto;
    });

    test("uses crypto.getRandomValues if randomUUID is missing", () => {
      const originalCrypto = globalThis.crypto;
      // @ts-ignore
      globalThis.crypto = { 
        getRandomValues: (arr: Uint8Array) => {
          arr.fill(170); // 0xaa
          return arr;
        } 
      };
      expect(defaultTraceIdGenerator()).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      globalThis.crypto = originalCrypto;
    });

    test("fallbacks to Math.random if crypto is missing", () => {
      const originalCrypto = globalThis.crypto;
      // @ts-ignore
      delete globalThis.crypto;
      const id = defaultTraceIdGenerator();
      expect(typeof id).toBe("string");
      // @ts-ignore
      globalThis.crypto = originalCrypto;
    });
  });

  describe("withTransaction", () => {
    const mockCtx = {
      translatorContext: mockTranslatorContext,
      isInTransaction: false,
    } as any;

    test("REQUIRED starts new transaction if not in one", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "REQUIRED" });
      expect(res).toBe("mock-tx");
      expect(mockTranslatorContext.db.transaction).toHaveBeenCalled();
    });

    test("REQUIRED joins existing transaction", async () => {
      const activeCtx = { ...mockCtx, isInTransaction: true };
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(activeCtx, fn, { propagation: "REQUIRED" });
      expect(res).toBe(mockTranslatorContext.db);
      expect(fn).toHaveBeenCalledWith(mockTranslatorContext.db);
    });

    test("REQUIRES_NEW always starts new transaction", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "REQUIRES_NEW" });
      expect(res).toBe("mock-tx");
    });

    test("NESTED always starts new transaction", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "NESTED" });
      expect(res).toBe("mock-tx");
    });

    test("SUPPORTS returns db handle directly", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "SUPPORTS" });
      expect(res).toBe(mockTranslatorContext.db);
    });

    test("MANDATORY throws if no transaction", async () => {
      const fn = mock(async () => {});
      await expect(withTransaction(mockCtx, fn, { propagation: "MANDATORY" }))
        .rejects.toThrow(ConfigurationError);
    });

    test("MANDATORY succeeds if in transaction", async () => {
      const activeCtx = { ...mockCtx, isInTransaction: true };
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(activeCtx, fn, { propagation: "MANDATORY" });
      expect(res).toBe(mockTranslatorContext.db);
    });

    test("NEVER throws if transaction exists", async () => {
      const activeCtx = { ...mockCtx, isInTransaction: true };
      const fn = mock(async () => {});
      await expect(withTransaction(activeCtx, fn, { propagation: "NEVER" }))
        .rejects.toThrow(ConfigurationError);
    });

    test("NEVER succeeds if no transaction", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "NEVER" });
      expect(res).toBe(mockTranslatorContext.db);
    });

    test("defaults to REQUIRED if no propagation provided", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, {} as any);
      expect(res).toBe("mock-tx");
    });

    test("defaults to SUPPORTS for unknown propagation", async () => {
      const fn = mock(async (tx: any) => tx);
      const res = await withTransaction(mockCtx, fn, { propagation: "UNKNOWN" } as any);
      expect(res).toBe(mockTranslatorContext.db);
    });
  });
});
