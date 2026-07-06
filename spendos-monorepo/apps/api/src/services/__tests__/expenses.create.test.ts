import { ExpensesService } from "../expenses.service";
import { UserRole, ExpenseStatus } from "@spendos/database";

// Shared tx handle so the test can assert that all writes target the SAME
// transaction (proving atomicity per SYSTEM_CONTRACT §11.2).
const tx = {
  expense: { create: jest.fn(), update: jest.fn() },
  outboxEvent: { create: jest.fn() },
};

jest.mock("@spendos/database", () => {
  const actual = jest.requireActual("@spendos/database");
  return {
    ...actual,
    prisma: {
      spendPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ full_name: "Test User" }) },
      $transaction: jest.fn((cb: any) => cb(tx)),
      // Deliberately NO top-level outboxEvent: a standalone write would throw,
      // which guarantees the outbox event is created via the tx handle only.
    },
  };
});

const auditLog = jest.fn();
jest.mock("../audit", () => ({ AuditService: { log: (...args: any[]) => auditLog(...args) } }));

describe("ExpensesService.createExpense — atomicity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.expense.create.mockResolvedValue({ id: "exp-new", status: ExpenseStatus.submitted });
  });

  it("writes the expense, outbox event, and audit log on the SAME transaction", async () => {
    const actor = { userId: "user-1", role: UserRole.EMPLOYEE, companyId: "comp-1" };

    await ExpensesService.createExpense(actor, 100000n, "2026-01-01", "travel" as any, "lunch");

    const prismaMock = require("@spendos/database").prisma;
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);

    // The audit log must receive the same tx handle as its second argument.
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "expense_submitted", targetId: "exp-new" }),
      tx
    );

    // Proves the outbox is not written through standalone prisma (it does not exist here).
    expect(prismaMock.outboxEvent).toBeUndefined();
  });

  it("emits an 'expense_submitted' outbox event when no auto-approve policy is active", async () => {
    const actor = { userId: "user-1", role: UserRole.EMPLOYEE, companyId: "comp-1" };

    await ExpensesService.createExpense(actor, 100000n, "2026-01-01", "travel" as any);

    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event_type: "expense_submitted", aggregate_id: "exp-new" }),
      })
    );
  });
});
