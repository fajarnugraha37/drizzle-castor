import { expect, test, describe, mock } from "bun:test";
import { runInContext, useExecutionContext, getExecutionContext, updateContextMetadata, endExecutionContext } from "../../../src/context/manager";
import { getContext, setMetadata, getState, setState } from "../../../src/helper/context-helper";

describe("Execution Context", () => {
  test("runInContext initializes context with 'running' status", async () => {
    const data = {
      action: "read" as any,
      tableName: "users",
      params: { id: 1 },
      metadata: { userId: "user-1" },
      db: {} as any,
      schemaMetadata: {} as any,
      translatorContext: {} as any
    };

    await runInContext(data, async (ctx) => {
      const current = useExecutionContext();
      expect(current.status).toBe("running");
      expect(current.startTime).toBeDefined();
      expect(current.endTime).toBeUndefined();
    });
  });

  test("endExecutionContext sets success status and calculates duration", async () => {
    await runInContext({ action: "read" as any, tableName: "t", params: {}, metadata: {}, db: {} as any, schemaMetadata: {} as any, translatorContext: {} as any }, async () => {
        await new Promise(r => setTimeout(r, 10));
        endExecutionContext("success");
        const ctx = useExecutionContext();
        expect(ctx.status).toBe("success");
        expect(ctx.endTime).toBeGreaterThanOrEqual(ctx.startTime + 10);
        expect(ctx.duration).toBeGreaterThanOrEqual(10);
    });
  });

  test("endExecutionContext sets failed status and records error", async () => {
    const error = new Error("db down");
    await runInContext({ action: "read" as any, tableName: "t", params: {}, metadata: {}, db: {} as any, schemaMetadata: {} as any, translatorContext: {} as any }, async () => {
        endExecutionContext("failed", error);
        const ctx = useExecutionContext();
        expect(ctx.status).toBe("failed");
        expect(ctx.error).toBe(error);
    });
  });

  test("getContext shorthand works", async () => {
    await runInContext({ action: "create" as any, tableName: "logs", params: {}, metadata: {} }, async () => {
      const ctx = getContext();
      expect(ctx.action).toBe("create");
    });
  });

  test("Context is isolated between parallel calls", async () => {
    const call1 = runInContext({ action: "read" as any, tableName: "t1", params: {}, metadata: { id: 1 } }, async () => {
      await new Promise(r => setTimeout(r, 10));
      return useExecutionContext().metadata.id;
    });

    const call2 = runInContext({ action: "read" as any, tableName: "t2", params: {}, metadata: { id: 2 } }, async () => {
      return useExecutionContext().metadata.id;
    });

    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1).toBe(1);
    expect(res2).toBe(2);
  });

  test("Nested calls share traceId but track span hierarchy via parentId", async () => {
    await runInContext({ action: "read" as any, tableName: "parent", params: {}, metadata: { userId: "parent-u" }, translatorContext: {}, db: {} as any, schemaMetadata: {} as any }, async (parentCtx) => {
      const parentTraceId = parentCtx.traceId;
      const parentSpanId = parentCtx.spanId;
      
      expect(parentSpanId).toBeDefined();
      expect(parentCtx.parentId).toBeUndefined();

      await runInContext({ action: "read" as any, tableName: "child", params: {}, metadata: { childId: "child-c" }, translatorContext: {}, db: {} as any, schemaMetadata: {} as any }, async (childCtx) => {
        expect(childCtx.traceId).toBe(parentTraceId);
        expect(childCtx.spanId).toBeDefined();
        expect(childCtx.spanId).not.toBe(parentSpanId);
        expect(childCtx.parentId).toBe(parentSpanId);
        expect(childCtx.tableName).toBe("child");
        
        // Metadata Inheritance Check
        expect(childCtx.metadata.userId).toBe("parent-u");
        expect(childCtx.metadata.childId).toBe("child-c");
      });
    });
  });

  test("setMetadata updates context metadata", async () => {
    await runInContext({ action: "read" as any, tableName: "users", params: {}, metadata: {} }, async () => {
      setMetadata("orgId", "org-123");
      expect(useExecutionContext().metadata.orgId).toBe("org-123");
    });
  });

  test("setState and getState work for cross-middleware data sharing", async () => {
    await runInContext({ action: "update" as any, tableName: "users", params: {}, metadata: {} }, async () => {
      setState("isInternal", true);
      expect(getState("isInternal")).toBe(true);
      expect(useExecutionContext().state.isInternal).toBe(true);
    });
  });

  test("Custom traceId generator works (sync)", async () => {
    const customGen = () => "custom-id";
    await runInContext(
      { action: "read" as any, tableName: "users", params: {}, metadata: {} },
      async (ctx) => {
        expect(ctx.traceId).toBe("custom-id");
      },
      customGen
    );
  });

  test("Custom traceId generator works (async)", async () => {
    const customGen = async () => "async-id";
    await runInContext(
      { action: "read" as any, tableName: "users", params: {}, metadata: {} },
      async (ctx) => {
        expect(ctx.traceId).toBe("async-id");
      },
      customGen
    );
  });

  test("useExecutionContext throws outside of context", () => {
    expect(() => useExecutionContext()).toThrow();
  });

  test("getExecutionContext returns undefined outside of context", () => {
    expect(getExecutionContext()).toBeUndefined();
  });
});
