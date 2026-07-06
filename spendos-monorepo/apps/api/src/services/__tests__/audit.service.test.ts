/**
 * AuditService hash-chain concurrency (Issue #4).
 *
 * The chain write is a read-modify-write of the per-company head. Without
 * serialization, two concurrent audits for the same company read the same last
 * record and fork the chain. The fix takes a per-company transaction-scoped
 * advisory lock (pg_advisory_xact_lock) before reading the head, so writers for
 * one company queue while writers for other companies are unaffected.
 *
 * These tests assert the lock is acquired (keyed on the company) BEFORE the
 * chain read, on both the ambient-transaction path and the no-transaction path,
 * and that chain linkage (previous_hash) is preserved.
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
import { AuditService } from "../audit";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const COMPANY = "11111111-1111-1111-1111-111111111111";
const ACTOR = "22222222-2222-2222-2222-222222222222";

const PAYLOAD = {
  companyId: COMPANY,
  actorId: ACTOR,
  action: "expense_approved",
  targetType: "Expense" as const,
  targetId: "44444444-4444-4444-4444-444444444444",
};

describe("AuditService — hash-chain serialization (Issue #4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("no ambient transaction", () => {
    beforeEach(() => {
      // Run the wrapping transaction inline against the same mock client.
      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.$executeRaw.mockResolvedValue(1 as any);
      prismaMock.auditLog.findFirst.mockResolvedValue(null as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: "a1" } as any);
    });

    it("opens a transaction and takes a per-company advisory lock", async () => {
      await AuditService.log(PAYLOAD);

      // A transaction is opened so the advisory lock has a scope to bind to.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

      // The lock is acquired via pg_advisory_xact_lock, keyed on the company.
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      const [templateParts, ...values] = prismaMock.$executeRaw.mock.calls[0] as any[];
      expect(templateParts.join("")).toContain("pg_advisory_xact_lock");
      expect(values).toContain(`audit:${COMPANY}`);
    });

    it("acquires the lock BEFORE reading the chain head", async () => {
      await AuditService.log(PAYLOAD);

      const lockOrder = prismaMock.$executeRaw.mock.invocationCallOrder[0];
      const readOrder = prismaMock.auditLog.findFirst.mock.invocationCallOrder[0];
      const writeOrder = prismaMock.auditLog.create.mock.invocationCallOrder[0];

      expect(lockOrder).toBeLessThan(readOrder);
      expect(readOrder).toBeLessThan(writeOrder);
    });

    it("chains previous_hash from the current head record", async () => {
      prismaMock.auditLog.findFirst.mockResolvedValue({ record_hash: "PREVHASH" } as any);

      await AuditService.log(PAYLOAD);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ previous_hash: "PREVHASH" }),
        })
      );
    });
  });

  describe("ambient transaction supplied", () => {
    it("uses the caller's tx and does NOT open a new transaction", async () => {
      const txMock = mockDeep<PrismaClient>();
      txMock.$executeRaw.mockResolvedValue(1 as any);
      txMock.auditLog.findFirst.mockResolvedValue(null as any);
      txMock.auditLog.create.mockResolvedValue({ id: "a1" } as any);

      await AuditService.log(PAYLOAD, txMock);

      // The lock + write ride the caller's transaction, held until it commits.
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(txMock.auditLog.create).toHaveBeenCalled();

      const [templateParts, ...values] = txMock.$executeRaw.mock.calls[0] as any[];
      expect(templateParts.join("")).toContain("pg_advisory_xact_lock");
      expect(values).toContain(`audit:${COMPANY}`);
    });
  });

  it("throws when the underlying write fails (missing audit = compliance failure)", async () => {
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.$executeRaw.mockResolvedValue(1 as any);
    prismaMock.auditLog.findFirst.mockResolvedValue(null as any);
    prismaMock.auditLog.create.mockRejectedValue(new Error("db down"));

    await expect(AuditService.log(PAYLOAD)).rejects.toThrow(
      "Audit log write failed, transaction aborted."
    );
  });
});
