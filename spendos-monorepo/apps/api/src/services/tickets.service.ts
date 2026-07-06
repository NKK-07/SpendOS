import { prisma, UserRole, ExpenseStatus, TicketStatus, ResolutionType, WorkflowState, FinancialState, DisputeState } from "@spendos/database";
import { AuditService } from "../services/audit";
import { NotificationsService } from "./notifications.service";
import { createJournalGroupWithTx } from "@spendos/ledger";
import { EntryType, TransactionType } from "@prisma/client";
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from "../lib/errors";
import { ExpenseStateMachine } from "./state_machine";
import { PolicyEngine, SpendOSAction } from "./policy.engine";

export class TicketsService {
  static async createTicket(actor: any, expenseId: string, note?: string) {
    // Any role can raise a ticket on their own approved expense after SLA breach

    const result = await prisma.$transaction(async (tx) => {
      const [expense]: any[] = await tx.$queryRaw`SELECT * FROM "expenses" WHERE id = ${expenseId}::uuid FOR UPDATE`;
      if (!expense || expense.company_id !== actor.companyId || expense.submitted_by !== actor.userId) {
        throw new ForbiddenError("Access denied");
      }
      if (expense.status !== ExpenseStatus.approved) throw new BadRequestError("Tickets can only be raised for approved expenses");
      if (expense.ticket_open) throw new ConflictError("A ticket is already open for this expense");

      // Add Dual Enforcement (Shadow Mode)
      PolicyEngine.assertTransition(actor, "RAISE_TICKET", expense, {
        workflowFrom: expense.workflow_state,
        workflowTo: expense.workflow_state,
        financialFrom: expense.financial_state,
        financialTo: expense.financial_state,
        disputeState: expense.dispute_state
      });

      const company = await tx.company.findUnique({ where: { id: actor.companyId }, select: { sla_days: true } });
      const approvedAt = expense.reviewed_at || expense.created_at;
      const daysSinceApproval = Math.floor((Date.now() - approvedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceApproval < (company?.sla_days || 14)) {
        throw new BadRequestError(`Ticket can only be raised after ${company?.sla_days} days from approval`);
      }

      const ticket = await tx.ticket.create({
        data: { company_id: actor.companyId, expense_id: expenseId, raised_by: actor.userId, user_note: note || null },
      });

      await tx.expense.update({ where: { id: expenseId }, data: { ticket_open: true } });

      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "ticket_raised", targetType: "Ticket", targetId: ticket.id }, tx);

      return { ticket, amount_paise: expense.amount_paise, approvedAt };
    });

    const submitter = await prisma.user.findUnique({ where: { id: actor.userId }, select: { full_name: true } });
    const rupees = result.amount_paise / 100n;
    const paise = result.amount_paise % 100n;
    const amountRupees = `${rupees.toLocaleString("en-IN")}.${paise.toString().padStart(2, "0")}`;
    await NotificationsService.notifyReviewers(actor.companyId, "ticket_raised",
      `${submitter?.full_name} raised a payment ticket for ₹${amountRupees} (approved ${result.approvedAt.toDateString()}).`, expenseId);

    return result.ticket;
  }

  static async getTickets(actor: any, take: number = 50, cursor?: string) {
    const where: any = {
      company_id: actor.companyId,
      ...(actor.role === UserRole.EMPLOYEE ? { raised_by: actor.userId } : {}),
    };

    const takeLimit = Math.min(Number(take), 100);
    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        expense: { select: { id: true, amount_paise: true, category: true, status: true, expense_date: true } },
        raiser: { select: { id: true, full_name: true } },
        resolver: { select: { id: true, full_name: true } },
      },
      take: takeLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    let nextCursor = null;
    if (tickets.length > takeLimit) {
      const nextItem = tickets.pop();
      nextCursor = nextItem!.id;
    }

    return { data: tickets, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async resolveTicket(actor: any, id: string, action: string, correlationId?: string, paymentDate?: string, paymentNote?: string, newDeadlineDate?: string, reason?: string) {
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { expense: true } });
    if (!ticket || ticket.company_id !== actor.companyId) throw new NotFoundError("Ticket not found");

    if (action === "withdraw") {
      if (ticket.raised_by !== actor.userId) throw new ForbiddenError("You can only withdraw your own tickets");
    } else {
      if (ticket.expense.submitted_by === actor.userId) {
        throw new ForbiddenError(`You cannot perform action '${action}' on your own expense ticket`);
      }
    }

    if (action === "mark_paid") {
      if (![UserRole.PRINCIPAL, UserRole.ADMIN].includes(actor.role)) {
        throw new ForbiddenError("Only Finance (Admin/Principal) can mark expenses as paid");
      }
      const { ExpensesService } = await import("./expenses.service");
      await ExpensesService.markPaid(actor, ticket.expense_id, paymentDate, paymentNote, correlationId);
      return;
    }

    const resolutionMap: Record<string, ResolutionType | null> = {
      extend: ResolutionType.extended,
      dispute: ResolutionType.disputed,
      withdraw: null,
    };
    const statusMap: Record<string, TicketStatus> = {
      extend: TicketStatus.extended,
      dispute: TicketStatus.disputed,
      withdraw: TicketStatus.resolved,
    };

    // Extend SLA deadlines is a finance-only action
    if (action === "extend") {
      if (![UserRole.PRINCIPAL, UserRole.ADMIN].includes(actor.role)) {
        throw new ForbiddenError("Only Finance (Admin/Principal) can extend SLA deadlines");
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Lock Ticket & read status inside transaction
      const [lockedTicket]: any[] = await tx.$queryRaw`
        SELECT * FROM "tickets" WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (!lockedTicket) throw new NotFoundError("Ticket not found");
      if (lockedTicket.status !== TicketStatus.open) {
        throw new BadRequestError("Ticket is already resolved");
      }

      // 2. Lock Parent Expense & read status inside transaction
      const [lockedExpense]: any[] = await tx.$queryRaw`
        SELECT * FROM "expenses" WHERE id = ${ticket.expense_id}::uuid FOR UPDATE
      `;
      if (!lockedExpense) throw new NotFoundError("Expense not found");
      
      let peAction: SpendOSAction = "RESOLVE_TICKET";
      if (action === "withdraw") peAction = "WITHDRAW_TICKET";
      if (action === "dispute") peAction = "RAISE_DISPUTE";

      // Add Dual Enforcement (Shadow Mode)
      PolicyEngine.assertTransition(actor, peAction, lockedExpense, {
        workflowFrom: lockedExpense.workflow_state,
        workflowTo: lockedExpense.workflow_state,
        financialFrom: lockedExpense.financial_state,
        financialTo: lockedExpense.financial_state,
        disputeState: action === "dispute" ? DisputeState.OPEN : lockedExpense.dispute_state
      });
      
      // Block backward state transitions (e.g. disputing an already paid expense)
      if (lockedExpense.status === ExpenseStatus.paid) {
        throw new BadRequestError("Cannot alter ticket on an already paid expense");
      }

      await tx.ticket.update({
        where: { id },
        data: {
          status: statusMap[action],
          resolution_type: resolutionMap[action],
          resolution_note: reason || null,
          new_deadline_date: newDeadlineDate ? new Date(newDeadlineDate) : null,
          resolved_by: actor.userId,
          resolved_at: new Date(),
        },
      });

      if (action === "dispute") {
        if (!ExpenseStateMachine.canTransition(lockedExpense.status, ExpenseStatus.disputed, actor.role)) {
          throw new BadRequestError(`Cannot dispute expense from status: ${lockedExpense.status}`);
        }
        await tx.expense.update({ where: { id: ticket.expense_id }, data: { status: ExpenseStatus.disputed, ticket_open: false } });
        await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "expense_disputed", targetType: "Expense", targetId: ticket.expense_id, correlationId }, tx);
      } else {
        await tx.expense.update({ where: { id: ticket.expense_id }, data: { ticket_open: false } });
      }

      const auditAction = action === "withdraw" ? "ticket_withdrawn" : "ticket_resolved";
      await AuditService.log({
        companyId: actor.companyId, actorId: actor.userId, action: auditAction, targetType: "Ticket", targetId: id, correlationId,
        metadata: { resolution_type: action, reason, new_deadline_date: newDeadlineDate }
      }, tx);

      await tx.outboxEvent.create({
        data: {
          aggregate_type: "Ticket",
          aggregate_id: ticket.id,
          event_type: "ticket_resolved",
          payload: { actorId: actor.userId, action, companyId: actor.companyId, raisedBy: ticket.raised_by, amountPaise: ticket.expense.amount_paise.toString() }
        }
      });
    });

    const msgMap: Record<string, string> = {
      extend: "extended",
      dispute: "disputed",
    };
    const rupees = ticket.expense.amount_paise / 100n;
    const paise = ticket.expense.amount_paise % 100n;
    const amountRupees = `${rupees.toLocaleString("en-IN")}.${paise.toString().padStart(2, "0")}`;
    await NotificationsService.createNotification({
      companyId: actor.companyId, userId: ticket.raised_by, type: "ticket_resolved",
      message: `Your payment ticket for ₹${amountRupees} has been ${msgMap[action]}.`,
      referenceId: ticket.expense_id, referenceType: "expense",
    });
  }
}
