process.env.ENABLE_LOCAL_S3 = "true";
import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

const COMPANY_UUID = "11111111-1111-1111-1111-111111111111";
const ADMIN_UUID = "33333333-3333-3333-3333-333333333333";
const MANAGER_UUID = "22222222-2222-2222-2222-222222222222";

// Mock the prisma client exported from @spendos/database
jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return {
    __esModule: true,
    ...original,
    prisma: mockDeep<PrismaClient>(),
  };
});

jest.mock("../services/cron", () => ({
  startCronJobs: jest.fn(),
}));

jest.mock("../services/outbox.processor", () => ({
  startOutboxWorker: jest.fn(),
}));

// Mock the auth package
jest.mock("@spendos/auth", () => ({
  verifyToken: jest.fn().mockImplementation((token) => {
    if (token === "mock-manager-token") {
      return { userId: MANAGER_UUID, companyId: COMPANY_UUID, role: 'MANAGER' };
    }
    return { userId: ADMIN_UUID, companyId: COMPANY_UUID, role: 'ADMIN' };
  }),
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

// Spy/Mock for Redis
const redisMock = {
  ping: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  del: jest.fn(),
  defineCommand: jest.fn(), // rate limiter init support
};
jest.mock("../services/redis.service", () => ({
  redis: redisMock,
}));

import { prisma, UserRole, ExpenseStatus, ExpenseCategory } from "@spendos/database";
import { fastify } from "../server";
import { ExpensesService } from "../services/expenses.service";
import { CreateExpenseSchema } from "@spendos/shared-types";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("Launch-Readiness Challenge Proof Tests", () => {
  const EXPENSE_UUID = "44444444-4444-4444-4444-444444444444";

  beforeEach(() => {
    jest.clearAllMocks();
    // Stub idempotency key lookups so the global middleware passes through
    prismaMock.idempotencyKey.findUnique.mockResolvedValue(null);
    prismaMock.idempotencyKey.upsert.mockResolvedValue({} as any);
  });

  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
  });

  // ─── CHALLENGE 1: CONCURRENT STATE TRANSITIONS & OUTBOX DUPLICATION ───
  it("should block concurrent approvals from executing duplicate state changes and outbox events", async () => {
    const mockExpense = {
      id: EXPENSE_UUID,
      company_id: COMPANY_UUID,
      submitted_by: "user-abc",
      amount_paise: 50000n,
      status: ExpenseStatus.submitted,
      category: "travel",
    };

    // Track state mutations inside mock transactions
    let outboxCreatedCount = 0;
    let currentStatus = ExpenseStatus.submitted;
    let activeTransactionPromise: Promise<any> = Promise.resolve();

    prismaMock.$transaction.mockImplementation(async (callback) => {
      const nextTx = activeTransactionPromise.then(async () => {
        const txMock = {
          $queryRaw: jest.fn().mockImplementation((query) => {
            // Simulate SELECT ... FOR UPDATE row lock by returning snapshot with current mutable status
            return Promise.resolve([{
              ...mockExpense,
              status: currentStatus,
            }]);
          }),
          expense: {
            update: jest.fn().mockImplementation((args) => {
              currentStatus = args.data.status;
              return Promise.resolve({ ...mockExpense, status: currentStatus });
            }),
          },
          outboxEvent: {
            create: jest.fn().mockImplementation(() => {
              outboxCreatedCount++;
              return Promise.resolve({ id: "outbox-1" });
            }),
          },
          auditLog: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "audit-1" }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };
        return callback(txMock as any);
      });

      activeTransactionPromise = nextTx.catch(() => {});
      return nextTx;
    });

    const actor = {
      companyId: COMPANY_UUID,
      userId: ADMIN_UUID,
      role: UserRole.ADMIN,
    };

    // Simulate two concurrent requests arriving in parallel
    const results = await Promise.allSettled([
      ExpensesService.approveExpense(actor, EXPENSE_UUID),
      ExpensesService.approveExpense(actor, EXPENSE_UUID)
    ]);

    // One of them must succeed and one must fail with 'Cannot approve expense' due to status validation under raw lock
    const fulfilled = results.filter(r => r.status === "fulfilled");
    const rejected = results.filter(r => r.status === "rejected") as any[];

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason.message).toContain("Cannot approve expense from status: approved");

    // The outbox must only have exactly ONE event created
    expect(outboxCreatedCount).toBe(1);
    expect(currentStatus).toBe(ExpenseStatus.approved);
  });

  // ─── CHALLENGE 2: LOCAL-S3 TENANT PATH TRAVERSAL ESCAPE ───
  it("should reject cross-tenant file escapes using relative path traversal (../) in local-s3", async () => {
    // Mock user resolve inside server preHandler hook
    prismaMock.user.findUnique.mockResolvedValue({
      id: ADMIN_UUID,
      company_id: COMPANY_UUID,
      role: UserRole.ADMIN,
      is_active: true,
      is_frozen: false,
    } as any);

    // Inject request simulating path traversal to escape actor's company folder
    const response = await fastify.inject({
      method: "GET",
      url: `/local-s3/companies/${COMPANY_UUID}/../different-company/receipt.pdf`,
      headers: {
        authorization: `Bearer mock-admin-token`,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain("Access denied: Cross-company file retrieval is strictly blocked.");
  });

  // ─── CHALLENGE 3: ROLE PERMISSION HARDENING ON markPaid ROUTE ───
  it("should block a Manager role from accessing mark-paid route and require Admin/Finance controls", async () => {
    // Mock user query returned for Manager JWT verify
    prismaMock.user.findUnique.mockResolvedValue({
      id: MANAGER_UUID,
      company_id: COMPANY_UUID,
      role: UserRole.MANAGER,
      is_active: true,
      is_frozen: false,
    } as any);

    // Fetch mark-paid with a Manager session context
    const response = await fastify.inject({
      method: "POST",
      url: `/api/v1/expenses/${EXPENSE_UUID}/mark-paid`,
      payload: {
        paymentDate: "2026-06-02",
        paymentNote: "Reimbursed",
      },
      headers: {
        "content-type": "application/json",
        authorization: `Bearer mock-manager-token`,
        "idempotency-key": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });

    // Manager should fail authorization checks at the mark-paid endpoint (since Admin is required!)
    expect(response.statusCode).toBe(403);
  });

  // ─── CHALLENGE 4: BIGINT PRECISION SAFETY ───
  it("should parse and transform string amounts exceeding MAX_SAFE_INTEGER into BigInt natively without precision loss", () => {
    const hugeStringAmount = "9007199254740993"; // MAX_SAFE_INTEGER + 2
    const parsed = CreateExpenseSchema.safeParse({
      amountPaise: hugeStringAmount,
      expenseDate: "2026-06-02",
      category: ExpenseCategory.travel,
      description: "Huge expense",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amountPaise).toBe(9007199254740993n);
      expect(typeof parsed.data.amountPaise).toBe("bigint");
    }
  });
});
