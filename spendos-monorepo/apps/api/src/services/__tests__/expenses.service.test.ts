import { ExpensesService } from "../expenses.service";
import { UserRole, ExpenseStatus, WorkflowState, FinancialState, DisputeState } from "@spendos/database";

// Mock the dependencies
jest.mock("@spendos/database", () => {
  const actual = jest.requireActual("@spendos/database");
  return {
    ...actual,
    prisma: {
      $transaction: jest.fn((callback) => {
        const mockTx = {
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: "exp-1",
              company_id: "comp-1",
              submitted_by: "user-1",
              status: ExpenseStatus.approved,
              amount_paise: 100000n,
              category: "TRAVEL",
              workflow_state: WorkflowState.APPROVED,
              financial_state: FinancialState.APPROVED,
              dispute_state: DisputeState.NONE,
            }
          ]),
          expense: {
            update: jest.fn().mockResolvedValue({ id: "exp-1", status: ExpenseStatus.paid }),
          },
          ticket: {
            updateMany: jest.fn(),
          },
          account: {
            findFirstOrThrow: jest.fn()
              .mockResolvedValueOnce({ id: "acc-corp" })
              .mockResolvedValueOnce({ id: "acc-treasury" }),
          },
          outboxEvent: {
            create: jest.fn(),
          },
          auditLog: {
            create: jest.fn(),
          }
        };
        return callback(mockTx);
      }),
    }
  };
});

jest.mock("../../lib/with_retry", () => ({
  executeSerializableTx: jest.fn((cb) => cb()),
}));

jest.mock("@spendos/ledger", () => ({
  createJournalGroupWithTx: jest.fn().mockResolvedValue({}),
}));

jest.mock("../audit", () => ({
  AuditService: {
    log: jest.fn(),
  }
}));

describe("ExpensesService Integration", () => {
  it("should mark an expense as paid, update ledger, and create audit log", async () => {
    const actor = { userId: "admin-1", role: UserRole.ADMIN, companyId: "comp-1" };
    
    await ExpensesService.markPaid(actor, "exp-1");

    const ledgerMock = require("@spendos/ledger").createJournalGroupWithTx;
    expect(ledgerMock).toHaveBeenCalledTimes(1);
    expect(ledgerMock.mock.calls[0][1]).toMatchObject({
      transactionType: "EXPENSE_REIMBURSEMENT",
      entries: [
        { accountId: "acc-corp", amountPaise: 100000n, entryType: "DEBIT" },
        { accountId: "acc-treasury", amountPaise: 100000n, entryType: "CREDIT" }
      ]
    });

    const auditMock = require("../audit").AuditService.log;
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "expense_paid",
        targetId: "exp-1",
      }),
      expect.anything()
    );

    const prismaMock = require("@spendos/database").prisma;
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
