import { prisma, UserRole, ExpenseStatus, ExpenseCategory, Expense, WorkflowState, FinancialState, DisputeState } from "@spendos/database";
import { AuditService } from "../services/audit";
import { NotificationsService, REVIEWER_ROLES } from "./notifications.service";
import { PoliciesService } from "./policies.service";
import { createJournalGroupWithTx } from "@spendos/ledger";
import { EntryType, TransactionType, Prisma } from "@prisma/client";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../lib/errors";
import { ActivityService } from "./activity.service";
import { ExpenseStateMachine } from "./state_machine";
import { PolicyEngine } from "./policy.engine";
import { executeSerializableTx } from "../lib/with_retry";

export class ExpensesService {
  static async createExpense(actor: any, amountPaise: number | bigint, expenseDate: string, category: ExpenseCategory, description?: string) {
    if (BigInt(amountPaise) <= 0n) {
      throw new BadRequestError("Expense amount must be greater than zero");
    }

    // Read-only inputs fetched before the write transaction.
    const policy = await PoliciesService.getPolicy(actor.companyId);
    const submitter = await prisma.user.findUnique({ where: { id: actor.userId }, select: { full_name: true } });

    // SYSTEM_CONTRACT §11.2: the expense row, its outbox event, and the audit
    // records MUST commit atomically. A single ACID transaction guarantees we
    // never persist an expense whose notification/event was silently lost.
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          company_id: actor.companyId,
          submitted_by: actor.userId,
          amount_paise: BigInt(amountPaise),
          expense_date: new Date(expenseDate),
          category,
          description: description || null,
          status: ExpenseStatus.submitted,
        },
      });

      // Pure evaluation (no DB writes) against the pre-fetched policy.
      const { isAutoApproved } = await PoliciesService.evaluateExpense(created as any, [], policy);

      if (isAutoApproved) {
        await tx.expense.update({
          where: { id: created.id },
          data: { status: ExpenseStatus.approved, reviewed_at: new Date() },
        });
        created.status = ExpenseStatus.approved;
        await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_auto_approved", targetType: "Expense", targetId: created.id }, tx);
      }

      await tx.outboxEvent.create({
        data: {
          aggregate_type: "Expense",
          aggregate_id: created.id,
          event_type: isAutoApproved ? "expense_approved" : "expense_submitted",
          payload: isAutoApproved
            ? {
                actorId: actor.userId,
                companyId: actor.companyId,
                submittedBy: actor.userId,
                amountPaise: amountPaise.toString(),
                category
              }
            : {
                companyId: actor.companyId,
                submitterName: submitter?.full_name,
                amountPaise: amountPaise.toString(),
                category
              }
        }
      });

      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_submitted", targetType: "Expense", targetId: created.id }, tx);

      return created;
    });

    // A new submission (and any auto-approval inside the transaction) changes
    // the company pending count and the submitter's personal view; evict both.
    await ActivityService.invalidatePulse(actor.companyId, expense.submitted_by);

    return expense;
  }

  static async getExpenses(actor: any, take: number, status?: ExpenseStatus, cursor?: string) {
    const isReviewer = REVIEWER_ROLES.includes(actor.role);
    const where: any = {
      company_id: actor.companyId,
      ...(isReviewer ? {} : { submitted_by: actor.userId }),
      ...(status ? { status } : {}),
    };

    const takeLimit = Math.min(Number(take) || 50, 100);
    const expenses = await prisma.expense.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: takeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        submitter: { select: { id: true, full_name: true, email: true } },
        documents: { select: { id: true, document_type: true, file_name: true, file_type: true, file_size_bytes: true, uploaded_at: true } },
        tickets: { select: { id: true, status: true, created_at: true }, orderBy: { created_at: "desc" }, take: 1 },
      },
    });

    let nextCursor = null;
    if (expenses.length > takeLimit) {
      const nextItem = expenses.pop();
      nextCursor = nextItem!.id;
    }

    return { data: expenses, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async getExpenseById(actor: any, id: string) {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        submitter: { select: { id: true, full_name: true, email: true } },
        reviewer: { select: { id: true, full_name: true } },
        payer: { select: { id: true, full_name: true } },
        documents: true,
        tickets: { orderBy: { created_at: "desc" } },
      },
    });

    if (!expense || expense.company_id !== actor.companyId) {
      throw new NotFoundError("Expense not found");
    }

    const isReviewer = REVIEWER_ROLES.includes(actor.role);
    if (!isReviewer && expense.submitted_by !== actor.userId) {
      throw new ForbiddenError("Access denied");
    }

    let finalExpense = expense;
    if (isReviewer && expense.status === ExpenseStatus.submitted) {
      const lockAcquired: any[] = await prisma.$queryRaw`
        UPDATE "expenses"
        SET review_locked_by = ${actor.userId}::uuid,
            review_locked_at = NOW()
        WHERE id = ${id}::uuid
        AND (
          review_locked_by IS NULL
          OR review_locked_at < NOW() - INTERVAL '10 minutes'
          OR review_locked_by = ${actor.userId}::uuid
        )
        RETURNING id
      `;
      
      if (lockAcquired.length > 0) {
        const freshlyLocked = await prisma.expense.findUnique({
          where: { id },
          include: {
            submitter: { select: { id: true, full_name: true, email: true } },
            reviewer: { select: { id: true, full_name: true } },
            payer: { select: { id: true, full_name: true } },
            documents: true,
            tickets: { orderBy: { created_at: "desc" } },
          },
        });
        if (freshlyLocked) finalExpense = freshlyLocked;
      }
    }

    let locked_by_user = null;
    if (finalExpense.review_locked_by) {
      locked_by_user = await prisma.user.findUnique({
        where: { id: finalExpense.review_locked_by },
        select: { full_name: true }
      });
    }

    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const monthlyCount = await prisma.expense.aggregate({
      where: { company_id: actor.companyId, submitted_by: expense.submitted_by, created_at: { gte: startOfMonth } },
      _count: { id: true },
      _sum: { amount_paise: true },
    });

    return {
      ...finalExpense,
      locked_by_user,
      locked_by: finalExpense.review_locked_by,
      locked_at: finalExpense.review_locked_at,
      submitterMonthlyContext: {
        count: monthlyCount._count.id,
        totalPaise: monthlyCount._sum.amount_paise,
      },
    };
  }

  static async approveExpense(actor: any, id: string, correlationId?: string, overrideReason?: string) {
    const previousState = await prisma.$transaction(async (tx) => {
      const [lockedExpense]: any[] = await tx.$queryRaw`
        SELECT * FROM "expenses" WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!lockedExpense || lockedExpense.company_id !== actor.companyId) {
        throw new NotFoundError("Expense not found");
      }
      if (lockedExpense.submitted_by === actor.userId) {
        throw new ForbiddenError("You cannot approve your own expense");
      }

      // Load cost-center allocations only when the approver carries an ABAC
      // scope, so PolicyEngine can enforce cost-center authorization.
      const allocations = actor.approval_scope
        ? await tx.expenseAllocation.findMany({ where: { expense_id: id }, include: { cost_center: true } })
        : [];

      // Policy enforcement — SoD/role/lock strict; state-axis shadow-logged.
      PolicyEngine.assertTransition(actor, "APPROVE_EXPENSE", { ...lockedExpense, allocations }, {
        workflowFrom: lockedExpense.workflow_state,
        workflowTo: WorkflowState.APPROVED,
        financialFrom: lockedExpense.financial_state,
        financialTo: FinancialState.APPROVED,
        disputeState: lockedExpense.dispute_state
      }, { overrideReason });

      if (lockedExpense.review_locked_by && lockedExpense.review_locked_by !== actor.userId) {
        if (lockedExpense.review_locked_at && Date.now() - lockedExpense.review_locked_at.getTime() < 10 * 60 * 1000) {
          if (actor.role === UserRole.ADMIN) {
            if (!overrideReason) throw new BadRequestError("Admin override requires an explicit reason");
            await AuditService.log({
              companyId: actor.companyId, actorId: actor.userId, action: "lock_override",
              targetType: "Expense", targetId: id, correlationId,
              metadata: { previous_owner: lockedExpense.review_locked_by, reason: overrideReason }
            }, tx);
          } else {
            throw new ConflictError("Expense is currently locked by another reviewer");
          }
        }
      }

      if (!ExpenseStateMachine.canTransition(lockedExpense.status, ExpenseStatus.approved, actor.role)) {
        throw new BadRequestError(`Cannot approve expense from status: ${lockedExpense.status}`);
      }

      await tx.expense.update({
        where: { id },
        data: { status: ExpenseStatus.approved, reviewed_by: actor.userId, reviewed_at: new Date() },
      });

      await tx.outboxEvent.create({
        data: {
          aggregate_type: "Expense",
          aggregate_id: id,
          event_type: "expense_approved",
          payload: { actorId: actor.userId, companyId: actor.companyId, submittedBy: lockedExpense.submitted_by, amountPaise: lockedExpense.amount_paise.toString(), category: lockedExpense.category }
        }
      });

      if (lockedExpense.status === ExpenseStatus.disputed) {
        const activeTicket = await tx.ticket.findFirst({ where: { expense_id: id }, orderBy: { created_at: "desc" } });
        await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "dispute_resolved_approved", targetType: "Expense", targetId: id, correlationId, metadata: { previous_status: lockedExpense.status, ticket_id: activeTicket?.id, review_lock_owner: lockedExpense.review_locked_by, actor_role: actor.role, timestamp: new Date().toISOString() } }, tx);
      }

      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_approved", targetType: "Expense", targetId: id, correlationId }, tx);

      return lockedExpense;
    });

    // Approval changes company velocity + pending counts and the submitter's
    // personal view, so evict both pulse entries. previousState is the locked
    // expense row returned from the transaction above.
    await ActivityService.invalidatePulse(actor.companyId, previousState.submitted_by);
  }

  static async rejectExpense(actor: any, id: string, reason: string, correlationId?: string, overrideReason?: string) {
    const previousState = await prisma.$transaction(async (tx) => {
      const [lockedExpense]: any[] = await tx.$queryRaw`
        SELECT * FROM "expenses" WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!lockedExpense || lockedExpense.company_id !== actor.companyId) {
        throw new NotFoundError("Expense not found");
      }
      if (lockedExpense.submitted_by === actor.userId) {
        throw new ForbiddenError("You cannot reject your own expense");
      }

      // Load cost-center allocations only when the approver carries an ABAC
      // scope, so PolicyEngine can enforce cost-center authorization.
      const allocations = actor.approval_scope
        ? await tx.expenseAllocation.findMany({ where: { expense_id: id }, include: { cost_center: true } })
        : [];

      // Policy enforcement — SoD/role/lock strict; state-axis shadow-logged.
      PolicyEngine.assertTransition(actor, "REJECT_EXPENSE", { ...lockedExpense, allocations }, {
        workflowFrom: lockedExpense.workflow_state,
        workflowTo: WorkflowState.REJECTED,
        financialFrom: lockedExpense.financial_state,
        financialTo: FinancialState.BLOCKED,
        disputeState: lockedExpense.dispute_state
      }, { overrideReason });

      if (lockedExpense.review_locked_by && lockedExpense.review_locked_by !== actor.userId) {
        if (lockedExpense.review_locked_at && Date.now() - lockedExpense.review_locked_at.getTime() < 10 * 60 * 1000) {
          if (actor.role === UserRole.ADMIN) {
            if (!overrideReason) throw new BadRequestError("Admin override requires an explicit reason");
            await AuditService.log({
              companyId: actor.companyId, actorId: actor.userId, action: "lock_override",
              targetType: "Expense", targetId: id, correlationId,
              metadata: { previous_owner: lockedExpense.review_locked_by, reason: overrideReason }
            }, tx);
          } else {
            throw new ConflictError("Expense is currently locked by another reviewer");
          }
        }
      }

      if (!ExpenseStateMachine.canTransition(lockedExpense.status, ExpenseStatus.rejected, actor.role)) {
        throw new BadRequestError(`Cannot reject expense from status: ${lockedExpense.status}`);
      }

      await tx.expense.update({
        where: { id },
        data: { status: ExpenseStatus.rejected, reviewed_by: actor.userId, reviewed_at: new Date(), rejection_reason: reason },
      });

      await tx.outboxEvent.create({
        data: {
          aggregate_type: "Expense",
          aggregate_id: id,
          event_type: "expense_rejected",
          payload: { companyId: actor.companyId, submittedBy: lockedExpense.submitted_by, amountPaise: lockedExpense.amount_paise.toString(), category: lockedExpense.category, reason }
        }
      });

      if (lockedExpense.status === ExpenseStatus.disputed) {
        const activeTicket = await tx.ticket.findFirst({ where: { expense_id: id }, orderBy: { created_at: "desc" } });
        await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "dispute_resolved_rejected", targetType: "Expense", targetId: id, correlationId, metadata: { reason, previous_status: lockedExpense.status, ticket_id: activeTicket?.id, review_lock_owner: lockedExpense.review_locked_by, actor_role: actor.role, timestamp: new Date().toISOString() } }, tx);
      }

      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_rejected", targetType: "Expense", targetId: id, correlationId, metadata: { reason } }, tx);

      return lockedExpense;
    });

    // Rejection changes company pending/flagged counts and the submitter's
    // personal view, so evict both pulse entries.
    await ActivityService.invalidatePulse(actor.companyId, previousState.submitted_by);
  }

  static async requestProof(actor: any, id: string, note?: string, correlationId?: string, overrideReason?: string) {
    const reviewer = await prisma.user.findUnique({ where: { id: actor.userId }, select: { full_name: true } });

    const updated = await prisma.$transaction(async (tx) => {
      const [lockedExpense]: any[] = await tx.$queryRaw`
        SELECT * FROM "expenses" WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!lockedExpense || lockedExpense.company_id !== actor.companyId) {
        throw new NotFoundError("Expense not found");
      }
      if (lockedExpense.submitted_by === actor.userId) {
        throw new ForbiddenError("You cannot request proof for your own expense");
      }

      // Add Dual Enforcement (Shadow Mode)
      PolicyEngine.assertTransition(actor, "REQUEST_PROOF", lockedExpense, {
        workflowFrom: lockedExpense.workflow_state,
        workflowTo: WorkflowState.PROOF_REQUESTED,
        financialFrom: lockedExpense.financial_state,
        financialTo: lockedExpense.financial_state,
        disputeState: lockedExpense.dispute_state
      }, { overrideReason });

      if (lockedExpense.review_locked_by && lockedExpense.review_locked_by !== actor.userId) {
        if (lockedExpense.review_locked_at && Date.now() - lockedExpense.review_locked_at.getTime() < 10 * 60 * 1000) {
          if (actor.role === UserRole.ADMIN) {
            if (!overrideReason) throw new BadRequestError("Admin override requires an explicit reason");
            await AuditService.log({
              companyId: actor.companyId, actorId: actor.userId, action: "lock_override",
              targetType: "Expense", targetId: id, correlationId,
              metadata: { previous_owner: lockedExpense.review_locked_by, reason: overrideReason }
            }, tx);
          } else {
            throw new ConflictError("Expense is currently locked by another reviewer");
          }
        }
      }

      if (!ExpenseStateMachine.canTransition(lockedExpense.status, ExpenseStatus.proof_requested, actor.role)) {
        throw new BadRequestError(`Cannot request proof from status: ${lockedExpense.status}`);
      }

      const upd = await tx.expense.update({
        where: { id },
        data: { status: ExpenseStatus.proof_requested, proof_requested_note: note || null, reviewed_by: actor.userId },
      });
      await tx.outboxEvent.create({
        data: {
          aggregate_type: "Expense",
          aggregate_id: id,
          event_type: "proof_requested",
          payload: { companyId: actor.companyId, submittedBy: lockedExpense.submitted_by, amountPaise: lockedExpense.amount_paise.toString(), reviewerName: reviewer?.full_name, note: note || null }
        }
      });

      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_proof_requested", targetType: "Expense", targetId: id, correlationId, metadata: { note } }, tx);

      return lockedExpense;
    });

    return updated;
  }

  static async markPaid(actor: any, id: string, paymentDate?: string, paymentNote?: string, correlationId?: string) {
    const updated = await executeSerializableTx(async () => {
      return await prisma.$transaction(async (tx) => {
        const [lockedExpense]: any[] = await tx.$queryRaw`
          SELECT * FROM "expenses" WHERE id = ${id}::uuid FOR UPDATE
        `;
        if (!lockedExpense || lockedExpense.company_id !== actor.companyId) {
          throw new NotFoundError("Expense not found");
        }
        if (lockedExpense.status === ExpenseStatus.paid) {
          // Idempotent success for retry storms
          return lockedExpense;
        }
        if (lockedExpense.submitted_by === actor.userId) {
          throw new ForbiddenError("You cannot mark your own expense as paid");
        }
        
        // Add Dual Enforcement (Shadow Mode)
        PolicyEngine.assertTransition(actor, "MARK_PAID", lockedExpense, {
          workflowFrom: lockedExpense.workflow_state,
          workflowTo: lockedExpense.workflow_state,
          financialFrom: lockedExpense.financial_state,
          financialTo: FinancialState.PAID,
          disputeState: lockedExpense.dispute_state
        });

        if (!ExpenseStateMachine.canTransition(lockedExpense.status, ExpenseStatus.paid, actor.role)) {
          throw new BadRequestError(`Cannot mark paid. Current status is ${lockedExpense.status}`);
        }

        const upd = await tx.expense.update({
          where: { id },
          data: {
            status: ExpenseStatus.paid,
            paid_by: actor.userId,
            paid_at: paymentDate ? new Date(paymentDate) : new Date(),
            payment_note: paymentNote || null,
            ticket_open: false,
          },
        });

        await tx.ticket.updateMany({ where: { expense_id: id, status: "open" }, data: { status: "resolved", resolution_type: "marked_paid", resolved_at: new Date() } });

        const corpExpense = await tx.account.findFirstOrThrow({ where: { company_id: actor.companyId, name: "Corporate Expense" } });
        // Reimbursements are disbursed from the Nodal Payout Account — the account
        // funded with the company's float at signup. The Corporate Treasury is never
        // funded, so crediting it here always drove it negative and tripped the
        // ledger's asset-negative guard, 500'ing every mark-paid.
        const payoutAccount = await tx.account.findFirstOrThrow({ where: { company_id: actor.companyId, name: "Nodal Payout Account" } });

        try {
          await createJournalGroupWithTx(tx, {
            companyId: actor.companyId,
            actorId: actor.userId,
            transactionType: TransactionType.EXPENSE_REIMBURSEMENT,
            description: `Reimbursement for Expense ${lockedExpense.id}`,
            transactionId: lockedExpense.id,
            idempotencyKey: `reimburse-ledger-${lockedExpense.id}`,
            entries: [
              { accountId: corpExpense.id, amountPaise: BigInt(lockedExpense.amount_paise), entryType: EntryType.DEBIT },
              { accountId: payoutAccount.id, amountPaise: BigInt(lockedExpense.amount_paise), entryType: EntryType.CREDIT },
            ],
          });
        } catch (err: any) {
          // Surface a genuine float depletion as a clean 400 instead of a 500.
          if (err?.message?.includes("Insufficient funds")) {
            throw new BadRequestError("Payout account has insufficient funds to reimburse this expense.");
          }
          throw err;
        }

        await tx.outboxEvent.create({
          data: {
            aggregate_type: "Expense",
            aggregate_id: lockedExpense.id,
            event_type: "expense_paid",
            payload: { actorId: actor.userId, companyId: actor.companyId, submittedBy: lockedExpense.submitted_by, amountPaise: lockedExpense.amount_paise.toString() }
          }
        });

        await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_paid", targetType: "Expense", targetId: id, correlationId }, tx);

        return upd;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });

    // Payment moves the expense out of the pending/approved buckets and updates
    // the submitter's reimbursement view; evict both pulse entries.
    await ActivityService.invalidatePulse(actor.companyId, updated.submitted_by);

    return updated;
  }

  static async verifyGst(actor: any, id: string, gstin: string) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.company_id !== actor.companyId) {
      throw new NotFoundError("Expense not found");
    }

    const { GSTService } = await import("./gst.service");
    const match = await GSTService.matchITC(gstin, expense.amount_paise, expense.expense_date);

    return match;
  }
}
