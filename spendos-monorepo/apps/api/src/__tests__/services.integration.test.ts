/**
 * Integration Test Suite — SpendOS API Services
 * 
 * Verifies the business logic, security policies, outbox events, and
 * transactional rollback behavior for ExpensesService and TicketsService.
 */

import { mockDeep, DeepMockProxy } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

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

import { prisma, UserRole, ExpenseStatus, ExpenseCategory, TicketStatus } from "@spendos/database";
import { ExpensesService } from "../services/expenses.service";
import { TicketsService } from "../services/tickets.service";
import { DocumentsService } from "../services/documents.service";
import { initializeBackgroundJobs, fastify } from "../server";
import { redis } from "../services/redis.service";
import { startCronJobs } from "../services/cron";
import { startOutboxWorker } from "../services/outbox.processor";
import * as fs from "fs";

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Valid UUIDs to satisfy Postgres UUID validation in schema
const COMPANY_UUID = "11111111-1111-1111-1111-111111111111";
const EMPLOYEE_UUID = "22222222-2222-2222-2222-222222222222";
const ADMIN_UUID = "33333333-3333-3333-3333-333333333333";
const EXPENSE_UUID_1 = "44444444-4444-4444-4444-444444444444";
const EXPENSE_UUID_2 = "55555555-5555-5555-5555-555555555555";
const EXPENSE_UUID_3 = "66666666-6666-6666-6666-666666666666";
const TICKET_UUID = "77777777-7777-7777-7777-777777777777";

describe("API Services Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default prisma.user.findMany to empty array to avoid undefined length issues in notifications service
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback) => {
      if (typeof callback === "function") {
        return callback(prismaMock);
      }
      return callback;
    });
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
    if (redis && typeof redis.quit === 'function') {
      await redis.quit();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPENSES SERVICE TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("ExpensesService", () => {
    const mockActor = {
      companyId: COMPANY_UUID,
      userId: EMPLOYEE_UUID,
      role: UserRole.EMPLOYEE,
    };

    it("should successfully submit a new expense and generate an outbox event", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        amount_paise: 50000n,
        expense_date: new Date(),
        category: ExpenseCategory.travel,
        description: "Taxi ride",
        status: ExpenseStatus.submitted,
        created_at: new Date(),
      };

      // Mock database calls
      prismaMock.expense.create.mockResolvedValue(mockExpense as any);
      prismaMock.spendPolicy.findUnique.mockResolvedValue(null); // No policy (manual review)
      prismaMock.user.findUnique.mockResolvedValue({ full_name: "John Doe" } as any);
      prismaMock.outboxEvent.create.mockResolvedValue({ id: "12345678-1234-1234-1234-1234567890ab" } as any);
      prismaMock.auditLog.create.mockResolvedValue({ id: "12345678-1234-1234-1234-1234567890ac" } as any);

      const result = await ExpensesService.createExpense(
        mockActor,
        50000,
        "2026-06-02",
        ExpenseCategory.travel,
        "Taxi ride"
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(EXPENSE_UUID_1);
      expect(result.status).toBe(ExpenseStatus.submitted);

      // Verify outbox event creation for async notification
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregate_type: "Expense",
          event_type: "expense_submitted",
          payload: expect.objectContaining({
            companyId: COMPANY_UUID,
            submitterName: "John Doe",
            amountPaise: "50000",
            category: ExpenseCategory.travel,
          }),
        }),
      });

      // Verify audit trail logged
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "expense_submitted",
            target_type: "Expense",
            target_id: EXPENSE_UUID_1,
          }),
        })
      );
    });

    it("should auto-approve an expense if it is under the policy threshold", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_2,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        amount_paise: 500n, // Under threshold
        expense_date: new Date(),
        category: ExpenseCategory.food,
        description: "Tea",
        status: ExpenseStatus.submitted,
        created_at: new Date(),
      };

      const mockPolicy = {
        id: "12345678-1234-1234-1234-1234567890ad",
        company_id: COMPANY_UUID,
        auto_approve_threshold: 1000n, // Under 10 rupees auto-approves
        receipt_required_above: 2000n,
        created_at: new Date(),
        updated_at: new Date(),
      };

      prismaMock.expense.create.mockResolvedValue(mockExpense as any);
      prismaMock.spendPolicy.findUnique.mockResolvedValue(mockPolicy as any);
      prismaMock.user.findUnique.mockResolvedValue({ full_name: "John Doe" } as any);
      prismaMock.expense.update.mockResolvedValue({ ...mockExpense, status: ExpenseStatus.approved } as any);

      const result = await ExpensesService.createExpense(
        mockActor,
        500,
        "2026-06-02",
        ExpenseCategory.food,
        "Tea"
      );

      // Status should become approved directly
      expect(result.status).toBe(ExpenseStatus.approved);
      expect(prismaMock.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPENSE_UUID_2 },
          data: expect.objectContaining({
            status: ExpenseStatus.approved,
          }),
        })
      );
    });

    it("should reject expense creation if amount is negative", async () => {
      await expect(
        ExpensesService.createExpense(mockActor, -100, "2026-06-02", ExpenseCategory.food, "Negative amount")
      ).rejects.toThrow("Expense amount must be greater than zero");
    });

    it("should reject expense creation if amount is zero", async () => {
      await expect(
        ExpensesService.createExpense(mockActor, 0, "2026-06-02", ExpenseCategory.food, "Zero amount")
      ).rejects.toThrow("Expense amount must be greater than zero");
    });

    it("should REJECT self-approval of an expense by the submitter", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        status: ExpenseStatus.submitted,
        amount_paise: 50000n,
        category: ExpenseCategory.travel,
      };

      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);

      const actor = {
        companyId: COMPANY_UUID,
        userId: EMPLOYEE_UUID,
        role: UserRole.MANAGER,
      };

      await expect(
        ExpensesService.approveExpense(actor, EXPENSE_UUID_1)
      ).rejects.toThrow("You cannot approve your own expense");
    });

    it("should REJECT self-rejection of an expense by the submitter", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        status: ExpenseStatus.submitted,
        amount_paise: 50000n,
        category: ExpenseCategory.travel,
      };

      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);

      const actor = {
        companyId: COMPANY_UUID,
        userId: EMPLOYEE_UUID,
        role: UserRole.MANAGER,
      };

      await expect(
        ExpensesService.rejectExpense(actor, EXPENSE_UUID_1, "No self-reject")
      ).rejects.toThrow("You cannot reject your own expense");
    });

    it("should REJECT markPaid if the expense is disputed", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        status: ExpenseStatus.disputed,
        amount_paise: 50000n,
        category: ExpenseCategory.travel,
      };

      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);

      const adminActor = {
        companyId: COMPANY_UUID,
        userId: ADMIN_UUID,
        role: UserRole.ADMIN,
      };

      await expect(
        ExpensesService.markPaid(adminActor, EXPENSE_UUID_1, "2026-06-02", "Paying a disputed expense")
      ).rejects.toThrow("Cannot mark paid. Current status is disputed");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TICKETS SERVICE TESTS & ATOMIC ROLLBACK
  // ─────────────────────────────────────────────────────────────────────────────
  describe("TicketsService", () => {
    const mockEmployee = {
      companyId: COMPANY_UUID,
      userId: EMPLOYEE_UUID,
      role: UserRole.EMPLOYEE,
    };

    const mockAdmin = {
      companyId: COMPANY_UUID,
      userId: ADMIN_UUID,
      role: UserRole.ADMIN,
    };

    it("should successfully raise a payment ticket after SLA period has expired", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_3,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        amount_paise: 10000n,
        status: ExpenseStatus.approved,
        ticket_open: false,
        reviewed_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // Approved 20 days ago (SLA is 14)
        created_at: new Date(),
      };

      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);
      prismaMock.expense.findUnique.mockResolvedValue(mockExpense as any);
      prismaMock.company.findUnique.mockResolvedValue({ sla_days: 14 } as any);
      prismaMock.ticket.create.mockResolvedValue({ id: TICKET_UUID } as any);
      prismaMock.user.findUnique.mockResolvedValue({ full_name: "John Doe" } as any);
      prismaMock.user.findMany.mockResolvedValue([{ id: ADMIN_UUID }] as any);

      const ticket = await TicketsService.createTicket(mockEmployee, EXPENSE_UUID_3, "SLA breached!");

      expect(ticket).toBeDefined();
      expect(ticket.id).toBe(TICKET_UUID);
      expect(prismaMock.ticket.create).toHaveBeenCalled();
      expect(prismaMock.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EXPENSE_UUID_3 },
          data: { ticket_open: true },
        })
      );
    });

    it("should reject ticket creation if SLA days have not elapsed yet", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_3,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        amount_paise: 10000n,
        status: ExpenseStatus.approved,
        ticket_open: false,
        reviewed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Approved only 5 days ago (SLA is 14)
        created_at: new Date(),
      };

      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);
      prismaMock.expense.findUnique.mockResolvedValue(mockExpense as any);
      prismaMock.company.findUnique.mockResolvedValue({ sla_days: 14 } as any);

      await expect(
        TicketsService.createTicket(mockEmployee, EXPENSE_UUID_3, "Too early!")
      ).rejects.toThrow("Ticket can only be raised after 14 days from approval");
    });

    it("should perform atomic transaction rollback when ledger entry fails during ticket resolution", async () => {
      const mockTicket = {
        id: TICKET_UUID,
        company_id: COMPANY_UUID,
        expense_id: EXPENSE_UUID_3,
        status: TicketStatus.open,
        raised_by: EMPLOYEE_UUID,
        expense: {
          id: EXPENSE_UUID_3,
          company_id: COMPANY_UUID,
          amount_paise: 15000n,
          status: ExpenseStatus.approved,
        },
      };

      prismaMock.ticket.findUnique.mockResolvedValue(mockTicket as any);
      
      // Mock $transaction context block that throws a ledger failure
      prismaMock.$transaction.mockImplementation(async (callback) => {
        // Create mock tx wrapper that behaves like prisma
        const txMock = {
          $queryRaw: jest.fn().mockResolvedValue([mockTicket.expense]),
          ticket: {
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          expense: {
            update: jest.fn().mockResolvedValue({}),
          },
          account: {
            findFirstOrThrow: jest.fn().mockImplementation((args) => {
              throw new Error("Ledger failure: Insufficient funds in treasury!");
            }),
          },
          outboxEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        // When the callback runs, it should execute the query and fail
        return callback(txMock as any);
      });

      // The call should fail with the ledger error, validating that the transaction threw the error and aborted
      await expect(
        TicketsService.resolveTicket(mockAdmin, TICKET_UUID, "mark_paid", "2026-06-02", "Paid out")
      ).rejects.toThrow("Ledger failure: Insufficient funds in treasury!");
    });

    it("should prevent double-payouts under concurrent execution via unified idempotency keys", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_3,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        amount_paise: 15000n,
        status: ExpenseStatus.approved,
        ticket_open: true,
      };

      const mockTicket = {
        id: TICKET_UUID,
        company_id: COMPANY_UUID,
        expense_id: EXPENSE_UUID_3,
        status: TicketStatus.open,
        raised_by: EMPLOYEE_UUID,
        expense: mockExpense,
      };

      // Set up mocks
      prismaMock.expense.findUnique.mockResolvedValue(mockExpense as any);
      prismaMock.ticket.findUnique.mockResolvedValue(mockTicket as any);

      // Track executions to assert uniqueness
      let journalGroupCreates = 0;
      let outboxEventCreates = 0;
      const idempotencyKeysUsed = new Map<string, { request_hash: string; response_snapshot: any }>();
      const pendingKeys = new Set<string>();

      prismaMock.$transaction.mockImplementation(async (callback) => {
        let localJournalGroupCreates = 0;
        let localOutboxEventCreates = 0;
        const localIdempotencyKeysAdded = new Map<string, { request_hash: string; response_snapshot: any }>();

        const txMock = {
          $queryRaw: jest.fn().mockImplementation((queryParts, ...values) => {
            const queryStr = typeof queryParts === 'string' ? queryParts : queryParts.join('');
            if (queryStr.includes('"expenses"')) {
              return Promise.resolve([mockExpense]);
            }
            if (queryStr.includes('"tickets"')) {
              return Promise.resolve([mockTicket]);
            }
            return Promise.resolve([]);
          }),
          ticket: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
          },
          expense: {
            update: jest.fn().mockResolvedValue({ ...mockExpense, status: ExpenseStatus.paid }),
          },
          account: {
            findFirstOrThrow: jest.fn().mockResolvedValue({ id: "acc-123", normal_balance: "DEBIT" }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "acc-123", normal_balance: "DEBIT" }),
          },
          journalEntry: {
            findFirst: jest.fn().mockResolvedValue({ running_balance: 1000000n }),
            create: jest.fn().mockResolvedValue({}),
          },
          journalGroup: {
            create: jest.fn().mockImplementation((args) => {
              localJournalGroupCreates++;
              return Promise.resolve({ id: "jg-123" });
            }),
          },
          idempotencyKey: {
            findUnique: jest.fn().mockImplementation((args) => {
              const key = args.where.key;
              const existing = localIdempotencyKeysAdded.get(key) || idempotencyKeysUsed.get(key);
              if (existing) {
                return Promise.resolve({
                  key,
                  request_hash: existing.request_hash,
                  response_snapshot: existing.response_snapshot,
                });
              }
              return Promise.resolve(null);
            }),
            create: jest.fn().mockImplementation((args) => {
              const key = args.data.key;
              if (idempotencyKeysUsed.has(key) || pendingKeys.has(key)) {
                throw new Error("Unique constraint violation on IdempotencyKey");
              }
              localIdempotencyKeysAdded.set(key, {
                request_hash: args.data.request_hash,
                response_snapshot: args.data.response_snapshot,
              });
              pendingKeys.add(key);
              return Promise.resolve({});
            }),
          },
          outboxEvent: {
            create: jest.fn().mockImplementation((args) => {
              localOutboxEventCreates++;
              return Promise.resolve({ id: "event-123" });
            }),
          },
          auditLog: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "audit-123" }),
          },
          $executeRaw: jest.fn().mockResolvedValue(1),
        };

        try {
          const res = await callback(txMock as any);
          // Commit phase: transaction successfully completed, merge changes into global state
          journalGroupCreates += localJournalGroupCreates;
          outboxEventCreates += localOutboxEventCreates;
          for (const [k, v] of localIdempotencyKeysAdded.entries()) {
            idempotencyKeysUsed.set(k, v);
            pendingKeys.delete(k);
          }
          return res;
        } catch (error) {
          // Rollback phase: discard local additions and free up pending keys
          for (const k of localIdempotencyKeysAdded.keys()) {
            pendingKeys.delete(k);
          }
          throw error;
        }
      });

      // Execute concurrently
      const results = await Promise.allSettled([
        ExpensesService.markPaid(mockAdmin, EXPENSE_UUID_3, "2026-06-02", "Paid directly"),
        TicketsService.resolveTicket(mockAdmin, TICKET_UUID, "mark_paid", "2026-06-02", "Paid via ticket")
      ]);

      // Verify at least one succeeded
      const fulfilled = results.filter(r => r.status === "fulfilled");
      if (fulfilled.length === 0) {
        console.error("CONCURRENT REJECTIONS:", results.map(r => r.status === "rejected" ? r.reason : null));
      }
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Verify that exactly ONE journal group write and outbox event write succeeded because they share the key!
      expect(journalGroupCreates).toBe(1);
      expect(outboxEventCreates).toBe(1);
      expect(idempotencyKeysUsed.size).toBe(1);
      expect(idempotencyKeysUsed.has(`reimburse-ledger-${EXPENSE_UUID_3}`)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENTS SERVICE TESTS & PATH TRAVERSAL PROTECTION
  // ─────────────────────────────────────────────────────────────────────────────
  describe("DocumentsService", () => {
    const mockEmployee = {
      companyId: COMPANY_UUID,
      userId: EMPLOYEE_UUID,
      role: UserRole.EMPLOYEE,
    };

    let statSpy: jest.SpyInstance;

    beforeEach(() => {
      statSpy = jest.spyOn(fs.promises, "stat");
    });

    afterEach(() => {
      statSpy.mockRestore();
    });

    it("should successfully verify and confirm a valid document upload", async () => {
      const mockExpense = {
        id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        submitted_by: EMPLOYEE_UUID,
        status: ExpenseStatus.submitted,
        amount_paise: 50000n,
      };

      // Server-authoritative key: companies/{companyId}/expenses/{expenseId}/...
      const validKey = `companies/${COMPANY_UUID}/expenses/${EXPENSE_UUID_1}/receipt.pdf`;

      const mockDoc = {
        id: "doc-123",
        expense_id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        document_type: "original",
        s3_key: validKey,
        file_name: "receipt.pdf",
        file_type: "application/pdf",
        file_size_bytes: 1024,
        uploaded_by: EMPLOYEE_UUID,
      };

      // Mock fs.promises.stat to return matching size
      statSpy.mockResolvedValue({ size: 1024 } as any);

      // Mock DB calls
      prismaMock.$queryRaw.mockResolvedValue([mockExpense] as any);
      prismaMock.expense.findUnique.mockResolvedValue(mockExpense as any);
      prismaMock.expenseDocument.create.mockResolvedValue(mockDoc as any);
      prismaMock.expenseDocument.findMany.mockResolvedValue([]); // No other docs
      prismaMock.spendPolicy.findUnique.mockResolvedValue(null); // No policies auto-approval trigger

      const result = await DocumentsService.confirmUpload(
        mockEmployee,
        EXPENSE_UUID_1,
        validKey,
        "receipt.pdf",
        "application/pdf",
        1024,
        "receipt"
      );

      expect(result).toBeDefined();
      expect(result.id).toBe("doc-123");
      expect(statSpy).toHaveBeenCalled();
      expect(prismaMock.expenseDocument.create).toHaveBeenCalled();
    });

    it("should reject with ForbiddenError if s3Key belongs to a different company (cross-tenant IDOR)", async () => {
      // Attacker in COMPANY_UUID submits a well-formed key that points at another
      // tenant's object. The guard must block it before any storage or DB access,
      // otherwise the document row would be created and later yield a presigned
      // download URL for the victim's file.
      const foreignCompany = "99999999-9999-9999-9999-999999999999";
      const foreignKey = `companies/${foreignCompany}/expenses/${EXPENSE_UUID_1}/secret.pdf`;

      await expect(
        DocumentsService.confirmUpload(
          mockEmployee,
          EXPENSE_UUID_1,
          foreignKey,
          "secret.pdf",
          "application/pdf",
          1024,
          "receipt"
        )
      ).rejects.toThrow("s3Key does not match the authorized upload path");

      // Blocked at the boundary: no storage verification and no document row created.
      expect(statSpy).not.toHaveBeenCalled();
      expect(prismaMock.expenseDocument.create).not.toHaveBeenCalled();
    });

    it("should reject with ForbiddenError if s3Key belongs to a different expense in the same company", async () => {
      // Same tenant, but the key points at a different expense's folder. The path is
      // scoped to {companyId}/{expenseId}, so this must be rejected too.
      const otherExpenseKey = `companies/${COMPANY_UUID}/expenses/${EXPENSE_UUID_2}/receipt.pdf`;

      await expect(
        DocumentsService.confirmUpload(
          mockEmployee,
          EXPENSE_UUID_1,
          otherExpenseKey,
          "receipt.pdf",
          "application/pdf",
          1024,
          "receipt"
        )
      ).rejects.toThrow("s3Key does not match the authorized upload path");

      expect(statSpy).not.toHaveBeenCalled();
      expect(prismaMock.expenseDocument.create).not.toHaveBeenCalled();
    });

    it("should reject and throw ForbiddenError if s3Key attempts directory traversal via parent directories", async () => {
      // Mock DB calls to ensure execution fails before hitting DB
      prismaMock.expense.findUnique.mockResolvedValue(null);

      // A traversal key cannot match the server-authoritative prefix, so the tenant
      // guard rejects it before the storage-layer traversal check is even reached.
      await expect(
        DocumentsService.confirmUpload(
          mockEmployee,
          EXPENSE_UUID_1,
          "../../../../etc/passwd",
          "passwd",
          "text/plain",
          1024,
          "receipt"
        )
      ).rejects.toThrow("s3Key does not match the authorized upload path");

      // Verify that fs.promises.stat was NEVER called, proving traversal was blocked at the boundary
      expect(statSpy).not.toHaveBeenCalled();
    });

    it("should reject and throw ForbiddenError if s3Key attempts boundary bypass using a partial folder name prefix match", async () => {
      await expect(
        DocumentsService.confirmUpload(
          mockEmployee,
          EXPENSE_UUID_1,
          "../uploads-malicious/file.txt",
          "file.txt",
          "text/plain",
          1024,
          "receipt"
        )
      ).rejects.toThrow("s3Key does not match the authorized upload path");

      expect(statSpy).not.toHaveBeenCalled();
    });

    it("should successfully generate a download URL for a reviewer", async () => {
      const mockDoc = {
        id: "doc-123",
        expense_id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        document_type: "original",
        s3_key: "companies/1111/expenses/4444/receipt.pdf",
        file_name: "receipt.pdf",
        expense: {
          id: EXPENSE_UUID_1,
          submitted_by: EMPLOYEE_UUID,
        },
      };

      prismaMock.expenseDocument.findUnique.mockResolvedValue(mockDoc as any);

      const mockAdmin = {
        companyId: COMPANY_UUID,
        userId: ADMIN_UUID,
        role: UserRole.ADMIN,
      };

      const result = await DocumentsService.downloadDocument(mockAdmin, "doc-123");
      expect(result).toBeDefined();
      expect(decodeURIComponent(result.downloadUrl)).toContain("companies/1111/expenses/4444/receipt.pdf");
    });

    it("should reject document download with NotFoundError if document belongs to a different company", async () => {
      const mockDoc = {
        id: "doc-123",
        expense_id: EXPENSE_UUID_1,
        company_id: "DIFFERENT-COMPANY-UUID",
        document_type: "original",
        s3_key: "companies/1111/expenses/4444/receipt.pdf",
        file_name: "receipt.pdf",
        expense: {
          id: EXPENSE_UUID_1,
          submitted_by: EMPLOYEE_UUID,
        },
      };

      prismaMock.expenseDocument.findUnique.mockResolvedValue(mockDoc as any);

      await expect(
        DocumentsService.downloadDocument(mockEmployee, "doc-123")
      ).rejects.toThrow("Document not found");
    });

    it("should reject document download with ForbiddenError if employee tries to access a coworker's document", async () => {
      const mockDoc = {
        id: "doc-123",
        expense_id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        document_type: "original",
        s3_key: "companies/1111/expenses/4444/receipt.pdf",
        file_name: "receipt.pdf",
        expense: {
          id: EXPENSE_UUID_1,
          submitted_by: "COWORKER-UUID",
        },
      };

      prismaMock.expenseDocument.findUnique.mockResolvedValue(mockDoc as any);

      await expect(
        DocumentsService.downloadDocument(mockEmployee, "doc-123")
      ).rejects.toThrow("Access denied: You do not have permission to download this receipt.");
    });

    it("should allow employee to download their own document", async () => {
      const mockDoc = {
        id: "doc-123",
        expense_id: EXPENSE_UUID_1,
        company_id: COMPANY_UUID,
        document_type: "original",
        s3_key: "companies/1111/expenses/4444/receipt.pdf",
        file_name: "receipt.pdf",
        expense: {
          id: EXPENSE_UUID_1,
          submitted_by: EMPLOYEE_UUID,
        },
      };

      prismaMock.expenseDocument.findUnique.mockResolvedValue(mockDoc as any);

      const result = await DocumentsService.downloadDocument(mockEmployee, "doc-123");
      expect(result).toBeDefined();
      expect(decodeURIComponent(result.downloadUrl)).toContain("companies/1111/expenses/4444/receipt.pdf");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKGROUND JOBS CONDITIONAL EXECUTION TESTS
  // ─────────────────────────────────────────────────────────────────────────────
  describe("BackgroundJobsBoot", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("should run cron jobs and outbox worker automatically in non-production environments", () => {
      process.env.NODE_ENV = "development";
      process.env.RUN_JOBS = "false";

      const activated = initializeBackgroundJobs();

      expect(activated).toBe(true);
      expect(startCronJobs).toHaveBeenCalledTimes(1);
      expect(startOutboxWorker).toHaveBeenCalledTimes(1);
    });

    it("should NOT run cron jobs or outbox worker in production if RUN_JOBS is false", () => {
      process.env.NODE_ENV = "production";
      process.env.RUN_JOBS = "false";

      const activated = initializeBackgroundJobs();

      expect(activated).toBe(false);
      expect(startCronJobs).not.toHaveBeenCalled();
      expect(startOutboxWorker).not.toHaveBeenCalled();
    });

    it("should run cron jobs and outbox worker in production if RUN_JOBS is true", () => {
      process.env.NODE_ENV = "production";
      process.env.RUN_JOBS = "true";

      const activated = initializeBackgroundJobs();

      expect(activated).toBe(true);
      expect(startCronJobs).toHaveBeenCalledTimes(1);
      expect(startOutboxWorker).toHaveBeenCalledTimes(1);
    });
  });
});

