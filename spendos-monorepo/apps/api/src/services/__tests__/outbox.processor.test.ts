/**
 * Outbox Processor — concurrency-safety tests.
 *
 * These verify the fix for the double-processing bug: the SELECT ... FOR UPDATE
 * SKIP LOCKED claim and the published=true marker MUST run inside the same
 * transaction so the row locks are held until commit. We assert that both the
 * claim (tx.$queryRawUnsafe) and the publish (tx.outboxEvent.update) happen on
 * the transaction client, never on the global prisma client — which is what
 * keeps SKIP LOCKED effective across multiple API instances.
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return {
    __esModule: true,
    ...original,
    prisma: mockDeep<PrismaClient>(),
  };
});

import { prisma } from "@spendos/database";
import { processOutboxBatch } from "../outbox.processor";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const EVENT = {
  id: "88888888-8888-8888-8888-888888888888",
  aggregate_type: "Expense",
  aggregate_id: "44444444-4444-4444-4444-444444444444",
  event_type: "expense_approved",
  payload: {
    companyId: "11111111-1111-1111-1111-111111111111",
    submittedBy: "22222222-2222-2222-2222-222222222222",
    amountPaise: "50000",
    category: "TRAVEL",
  },
  retry_count: 0,
  failed: false,
  created_at: new Date(),
};

describe("Outbox Processor — processOutboxBatch()", () => {
  let txMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Distinct transaction client so we can assert claim + publish run on `tx`,
    // not on the global prisma connection.
    txMock = mockDeep<PrismaClient>();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(txMock));
    // processEvent runs on the GLOBAL client (notifications). Keep it inert.
    prismaMock.user.findMany.mockResolvedValue([] as any);
    prismaMock.notification.create.mockResolvedValue({ id: "n1" } as any);
  });

  it("claims and publishes within a single transaction (lock held to commit)", async () => {
    txMock.$queryRawUnsafe.mockResolvedValue([EVENT] as any);

    await processOutboxBatch();

    // The whole batch is wrapped in one transaction.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    // The claim (SELECT ... FOR UPDATE SKIP LOCKED) runs on the tx client.
    expect(txMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const sql = (txMock.$queryRawUnsafe.mock.calls[0][0] as string);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");

    // The publish runs on the SAME tx client — so the lock is held until commit.
    expect(txMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: EVENT.id },
      data: { published: true },
    });

    // And NEVER on the global client (that was the original bug).
    expect(prismaMock.outboxEvent.update).not.toHaveBeenCalled();
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("on processEvent failure, increments retry_count within the transaction", async () => {
    txMock.$queryRawUnsafe.mockResolvedValue([EVENT] as any);
    // Force processEvent to throw by making its notification write reject.
    prismaMock.notification.create.mockRejectedValue(new Error("boom"));

    await processOutboxBatch();

    // Failure path updates retry bookkeeping on the tx client, not published.
    expect(txMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: EVENT.id },
      data: { retry_count: 1, failed: false },
    });
    expect(txMock.outboxEvent.update).not.toHaveBeenCalledWith({
      where: { id: EVENT.id },
      data: { published: true },
    });
  });

  it("marks an event permanently failed after the retry threshold", async () => {
    txMock.$queryRawUnsafe.mockResolvedValue([{ ...EVENT, retry_count: 2 }] as any);
    prismaMock.notification.create.mockRejectedValue(new Error("boom"));

    await processOutboxBatch();

    expect(txMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: EVENT.id },
      data: { retry_count: 3, failed: true },
    });
  });

  it("does nothing when there are no unpublished events", async () => {
    txMock.$queryRawUnsafe.mockResolvedValue([] as any);

    await processOutboxBatch();

    expect(txMock.outboxEvent.update).not.toHaveBeenCalled();
  });
});
