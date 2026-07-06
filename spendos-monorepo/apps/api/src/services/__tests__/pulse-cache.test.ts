/**
 * Pulse cache invalidation (Issue #3).
 *
 * The dashboard pulse is cached under `pulse:global:{companyId}` and
 * `pulse:user:{userId}` (ActivityService), but approve/reject previously
 * evicted a `pulse:{companyId}` key that never existed, and markPaid /
 * auto-approve did not evict at all — so dashboards served stale data for up
 * to the 5-minute TTL. These tests lock the correct keys and the wiring.
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

const redisMock = { del: jest.fn().mockResolvedValue(1) };
jest.mock("../redis.service", () => ({ redis: redisMock, isRedisMock: true }));

import { prisma, UserRole, ExpenseStatus, ExpenseCategory } from "@spendos/database";
import { ActivityService } from "../activity.service";
import { ExpensesService } from "../expenses.service";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

const COMPANY = "11111111-1111-1111-1111-111111111111";
const EMPLOYEE = "22222222-2222-2222-2222-222222222222";
const ADMIN = "33333333-3333-3333-3333-333333333333";
const EXPENSE = "44444444-4444-4444-4444-444444444444";

describe("Pulse cache invalidation (Issue #3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.del.mockResolvedValue(1);
  });

  describe("ActivityService.invalidatePulse", () => {
    it("evicts both the global and the submitter's user key", async () => {
      await ActivityService.invalidatePulse(COMPANY, EMPLOYEE);
      expect(redisMock.del).toHaveBeenCalledWith(
        `pulse:global:${COMPANY}`,
        `pulse:user:${EMPLOYEE}`
      );
    });

    it("evicts only the global key when no submitter is given", async () => {
      await ActivityService.invalidatePulse(COMPANY);
      expect(redisMock.del).toHaveBeenCalledWith(`pulse:global:${COMPANY}`);
    });

    it("never uses the legacy pulse:{companyId} key that caused the bug", async () => {
      await ActivityService.invalidatePulse(COMPANY, EMPLOYEE);
      const calledKeys = redisMock.del.mock.calls.flat();
      expect(calledKeys).not.toContain(`pulse:${COMPANY}`);
    });

    it("keys match the format used to READ the cache (no drift)", () => {
      // Guards against the reads and eviction using different key shapes.
      expect(ActivityService.pulseGlobalKey(COMPANY)).toBe(`pulse:global:${COMPANY}`);
      expect(ActivityService.pulseUserKey(EMPLOYEE)).toBe(`pulse:user:${EMPLOYEE}`);
    });

    it("swallows redis errors so a cache blip cannot break the mutation", async () => {
      redisMock.del.mockRejectedValue(new Error("redis down"));
      await expect(
        ActivityService.invalidatePulse(COMPANY, EMPLOYEE)
      ).resolves.toBeUndefined();
    });
  });

  describe("approveExpense wiring", () => {
    it("invalidates pulse with the company + submitter keys after a successful approval", async () => {
      const lockedExpense = {
        id: EXPENSE,
        company_id: COMPANY,
        submitted_by: EMPLOYEE,
        status: ExpenseStatus.submitted,
        amount_paise: 50000n,
        category: ExpenseCategory.travel,
        review_locked_by: null,
        review_locked_at: null,
        workflow_state: "IN_REVIEW",
        financial_state: "NOT_APPROVED",
        dispute_state: "NONE",
      };

      prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
      prismaMock.$queryRaw.mockResolvedValue([lockedExpense] as any);
      prismaMock.expense.update.mockResolvedValue(lockedExpense as any);
      prismaMock.outboxEvent.create.mockResolvedValue({ id: "e1" } as any);
      prismaMock.auditLog.findFirst.mockResolvedValue(null as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: "a1" } as any);

      const spy = jest
        .spyOn(ActivityService, "invalidatePulse")
        .mockResolvedValue(undefined);

      const admin = { companyId: COMPANY, userId: ADMIN, role: UserRole.ADMIN };
      await ExpensesService.approveExpense(admin, EXPENSE);

      expect(spy).toHaveBeenCalledWith(COMPANY, EMPLOYEE);
      spy.mockRestore();
    });
  });
});
