import { expect, test, describe, mock, spyOn } from "bun:test";
import { CastorLogger, PatternFormatter } from "../../src/helper/logger-helper";
import { runInContext } from "../../src/context/manager";

describe("Logger System", () => {
  test("PatternFormatter correctly replaces all basic symbols", () => {
    const pattern = "%p %c %i %z %s %n";
    const formatter = new PatternFormatter(pattern);
    const formatted = formatter.format("warn", "auth", "Access Denied");
    
    expect(formatted).toContain("WARN");
    expect(formatted).toContain("auth");
    expect(formatted).toContain(process.pid.toString());
    expect(formatted).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(formatted).toContain("Access Denied");
    expect(formatted).toContain("\n");
  });

  test("PatternFormatter handles date formatting %d{...}", () => {
    const formatter = new PatternFormatter("%d{yyyy-MM-dd}");
    const formatted = formatter.format("info", "test", "msg");
    const today = new Date().toISOString().split("T")[0];
    expect(formatted).toContain(today);
  });

  test("PatternFormatter handles thread/trace ID symbol %t", async () => {
    const formatter = new PatternFormatter("[%t] %s");
    const traceId = "test-trace-123";
    
    await runInContext({ traceId } as any, async (ctx) => {
      const formatted = formatter.format("info", "test", "msg");
      expect(formatted).toBe(`[${ctx.traceId}] msg`);
    });
  });

  test("PatternFormatter handles missing trace ID in %t", () => {
    const formatter = new PatternFormatter("[%t] %s");
    const formatted = formatter.format("info", "test", "msg");
    expect(formatted).toBe("[no-trace] msg");
  });

  test("PatternFormatter handles complex context injection %{...}", async () => {
    const pattern = "%{spanId} %{parentId} %{params.projection} %{params.order}";
    const formatter = new PatternFormatter(pattern);
    
    const inputContext = {
      params: {
        projection: ["id", "name"],
        order: { createdAt: "desc" }
      }
    };
    
    // We use custom ID generators to have predictable results
    let idCounter = 0;
    const mockIdGen = () => `id-${++idCounter}`;

    await runInContext({} as any, async (parentCtx) => {
      await runInContext(inputContext as any, async (ctx) => {
        const formatted = formatter.format("info", "test", "msg");
        expect(formatted).toContain(ctx.spanId);
        expect(formatted).toContain(ctx.parentId!);
        expect(formatted).toContain(JSON.stringify(ctx.params.projection));
        expect(formatted).toContain(JSON.stringify(ctx.params.order));
      }, mockIdGen);
    }, mockIdGen);
  });

  test("PatternFormatter correctly replaces symbols", () => {
    const formatter = new PatternFormatter("[%p] %s");
    const formatted = formatter.format("info", "test", "Hello World");
    expect(formatted).toBe("[INFO] Hello World");
  });

  test("PatternFormatter injects context values", async () => {
    const formatter = new PatternFormatter("%{tableName}: %s");
    
    await runInContext({ tableName: "users", action: "read" } as any, async () => {
      const formatted = formatter.format("info", "test", "Accessing");
      expect(formatted).toBe("users: Accessing");
    });
  });

  test("PatternFormatter handles nested context values", async () => {
    const formatter = new PatternFormatter("%{params.query.limit}: %s");
    
    await runInContext({ 
      tableName: "users", 
      action: "read",
      params: { query: { limit: 10 } }
    } as any, async () => {
      const formatted = formatter.format("info", "test", "Limit set");
      expect(formatted).toBe("10: Limit set");
    });
  });

  test("PatternFormatter handles nested array indexing %{...[0]}", async () => {
    const formatter = new PatternFormatter("%{params.projection[0]} and %{params.projection[1]}");
    
    await runInContext({ 
      params: { projection: ["id", "name"] }
    } as any, async () => {
      const formatted = formatter.format("info", "test", "msg");
      expect(formatted).toBe("id and name");
    });
  });

  test("PatternFormatter handles null/undefined in nested paths gracefully", async () => {
    const formatter = new PatternFormatter("Value: %{params.missing.path}");
    
    await runInContext({ 
      params: { existing: true }
    } as any, async () => {
      const formatted = formatter.format("info", "test", "msg");
      expect(formatted).toBe("Value: ");
    });
  });

  test("CastorLogger respects log levels", () => {
    const logSpy = spyOn(process.stdout, "write");
    const logger = new CastorLogger({ level: "ERROR" });

    logger.info("Should not log");
    expect(logSpy).not.toHaveBeenCalled();

    logger.error("Should log");
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});