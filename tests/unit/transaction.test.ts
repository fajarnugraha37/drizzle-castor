import { expect, test, describe, mock, beforeEach } from "bun:test";
import { createSchemaBuilder } from "../../src/schema-metadata-builder";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { ConfigurationError } from "../../src/errors";
import { getExecutionContext } from "../../src/context/manager";

describe("Transaction Management", () => {
  const users = pgTable("users", {
    id: serial("id").primaryKey(),
    name: text("name"),
  });

  const createMockChain = () => {
    const chain: any = mock(() => chain);
    chain.select = mock(() => chain);
    chain.from = mock(() => chain);
    chain.where = mock(() => chain);
    chain.groupBy = mock(() => chain);
    chain.orderBy = mock(() => chain);
    chain.limit = mock(() => chain);
    chain.offset = mock(() => chain);
    chain.innerJoin = mock(() => chain);
    chain.leftJoin = mock(() => chain);
    chain.then = (onRes: any) => Promise.resolve([]).then(onRes);
    chain.catch = (onErr: any) => Promise.resolve([]).catch(onErr);
    return chain;
  };

  let mockDb: any;
  let transactionCount = 0;

  beforeEach(() => {
    transactionCount = 0;

    const createTxHandle = (depth: number): any => ({
      _isTransaction: true,
      _depth: depth,
      transaction: mock(async (cb: any) => {
        transactionCount++;
        return await cb(createTxHandle(depth + 1));
      }),
      select: createMockChain(),
      insert: createMockChain(),
      update: createMockChain(),
      delete: createMockChain(),
      execute: mock(async () => []),
      $with: mock(() => ({
         as: mock((qb: any) => ({ ...qb, _isCte: true }))
      })),
      with: mock(() => createMockChain()),
      dialect: { escapeParam: (i: number) => `$${i + 1}` },
    });

    mockDb = {
      transaction: mock(async (cb: any, opts: any) => {
        transactionCount++;
        return await cb(createTxHandle(1));
      }),
      select: createMockChain(),
      insert: createMockChain(),
      update: createMockChain(),
      delete: createMockChain(),
      execute: mock(async () => []),
      $with: mock(() => ({
         as: mock((qb: any) => ({ ...qb, _isCte: true }))
      })),
      with: mock(() => createMockChain()),
      dialect: { escapeParam: (i: number) => `$${i + 1}` },
    };
  });

  test("REQUIRED propagation joins existing transaction", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async (tx1) => {
      expect(transactionCount).toBe(1);
      
      await tx1.transaction(async (tx2) => {
        // Should join tx1
        expect(transactionCount).toBe(1);
        expect(tx2.db).toBe(tx1.db);
      }, { propagation: "REQUIRED" });
    });
  });

  test("REQUIRES_NEW starts a new transaction handle distinct from parent", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async (tx1) => {
      const parentHandle = tx1.db;

      await tx1.transaction(async (tx2) => {
        // REQUIRES_NEW should have a new handle (Savepoint/Nested TX)
        expect(transactionCount).toBe(2);
        expect(tx2.db).not.toBe(parentHandle);
      }, { propagation: "REQUIRES_NEW" });
    });
  });

  test("NESTED starts a new transaction handle (Savepoint)", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async (tx1) => {
      const parentHandle = tx1.db;

      await tx1.transaction(async (tx2) => {
        expect(transactionCount).toBe(2);
        expect(tx2.db).not.toBe(parentHandle);
      }, { propagation: "NESTED" });
    });
  });

  test("SUPPORTS propagation uses transaction if available", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    // Case 1: Outside transaction
    await castor.transaction(async (tx) => {
       expect(transactionCount).toBe(0);
    }, { propagation: "SUPPORTS" });

    // Case 2: Inside transaction
    await castor.transaction(async (tx1) => {
      expect(transactionCount).toBe(1);
      await tx1.transaction(async (tx2) => {
         expect(transactionCount).toBe(1);
         expect(tx2.db).toBe(tx1.db);
      }, { propagation: "SUPPORTS" });
    });
  });

  test("MANDATORY propagation throws if no active transaction", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await expect(castor.transaction(async () => {}, { propagation: "MANDATORY" }))
      .rejects.toThrow(ConfigurationError);
  });

  test("NEVER propagation throws if active transaction exists", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async (txInstance) => {
      await expect(txInstance.transaction(async () => {}, { propagation: "NEVER" }))
        .rejects.toThrow(ConfigurationError);
    });
  });

  test("Propagates isolation level to Drizzle", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async () => {}, { isolationLevel: "serializable" });

    expect(mockDb.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "serializable" })
    );
  });

  test("State is inherited across transaction spans", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();
    const userRepo = castor.repoFactory("users");

    await castor.transaction(async () => {
       const ctx = getExecutionContext();
       ctx!.state.foo = "bar";

       await userRepo.searchMany({});

       // Inside withTransaction or repository execution context, state should persist
       await castor.transaction(async () => {
          const innerCtx = getExecutionContext();
          expect(innerCtx?.state.foo).toBe("bar");
       });
    });
  });

  test("Nested transaction on ROOT instance joins existing transaction", async () => {
    const builder = createSchemaBuilder(mockDb, [users] as const);
    const castor = builder.build();

    await castor.transaction(async (tx1) => {
      expect(transactionCount).toBe(1);
      
      // Call transaction on the ROOT castor instance while inside tx1
      await castor.transaction(async (tx2) => {
         expect(transactionCount).toBe(1);
         expect(tx2.db).toBe(tx1.db);
      }, { propagation: "REQUIRED" });
    });
  });

  test("Repository created outside joins transaction and uses correct handle", async () => {
    const txHandleDistinct = {
      ...mockDb,
      _isTransaction: true,
      select: createMockChain(),
    };
    const rootDbDistinct = {
      ...mockDb,
      transaction: mock(async (cb: any) => cb(txHandleDistinct)),
      select: createMockChain(),
    };

    const builder = createSchemaBuilder(rootDbDistinct, [users] as const);
    const castor = builder.build();
    const userRepo = castor.repoFactory("users");

    await castor.transaction(async () => {
      const ctx = getExecutionContext();
      expect(ctx?.isInTransaction).toBe(true);

      await userRepo.searchMany({});
      
      expect(rootDbDistinct.select).not.toHaveBeenCalled();
      expect(txHandleDistinct.select).toHaveBeenCalled();
    });
  });
});
