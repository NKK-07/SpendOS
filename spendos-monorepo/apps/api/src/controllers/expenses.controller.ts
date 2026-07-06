import { FastifyRequest, FastifyReply } from "fastify";
import { ExpensesService } from "../services/expenses.service";
import { DocumentsService } from "../services/documents.service";
import { TicketsService } from "../services/tickets.service";
import { BadRequestError } from "../lib/errors";

export class ExpensesController {
  static async createExpense(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { amountPaise, expenseDate, category, description } = request.body;

    const expense = await ExpensesService.createExpense(actor, amountPaise, expenseDate, category, description);
    return expense;
  }

  static async getExpenses(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, status, cursor } = request.query as any || {};

    const expenses = await ExpensesService.getExpenses(actor, take, status, cursor);
    return expenses;
  }

  static async getExpenseById(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;

    const expense = await ExpensesService.getExpenseById(actor, id);
    return expense;
  }

  static async approveExpense(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { overrideReason } = request.body || {};

    await ExpensesService.approveExpense(actor, id, request.id, overrideReason);
    return { message: "Expense approved" };
  }

  static async rejectExpense(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { reason, overrideReason } = request.body || {};

    if (!reason || reason.trim().length === 0) throw new BadRequestError("Rejection reason is required");

    await ExpensesService.rejectExpense(actor, id, reason, request.id, overrideReason);
    return { message: "Expense rejected" };
  }

  static async requestProof(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { note, overrideReason } = request.body || {};

    const updated = await ExpensesService.requestProof(actor, id, note, request.id, overrideReason);
    return updated;
  }

  static async markPaid(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { paymentDate, paymentNote } = request.body || {};

    const updated = await ExpensesService.markPaid(actor, id, paymentDate, paymentNote, request.id);
    return updated;
  }

  static async getUploadUrl(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { filename, contentType } = request.query;

    const result = await DocumentsService.getUploadUrl(actor, id, filename, contentType);
    return result;
  }

  static async confirmUpload(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { s3Key, fileName, fileType, fileSize, docType } = request.body;

    const document = await DocumentsService.confirmUpload(actor, id, s3Key, fileName, fileType, fileSize, docType);
    return document;
  }


  static async createTicket(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { expenseId, note } = request.body;

    const ticket = await TicketsService.createTicket(actor, expenseId, note);
    return ticket;
  }

  static async getTickets(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const tickets = await TicketsService.getTickets(actor, take, cursor);
    return tickets;
  }

  static async resolveTicket(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { action, paymentDate, paymentNote, newDeadlineDate, reason } = request.body || {};

    const validActions = ["mark_paid", "extend", "dispute", "withdraw"];
    if (!validActions.includes(action)) return reply.status(400).send({ error: `action must be one of: ${validActions.join(", ")}` });

    if (action === "extend" && (!newDeadlineDate || !reason)) {
      return reply.status(400).send({ error: "newDeadlineDate and reason required for extension" });
    }
    if (action === "dispute" && !reason) {
      return reply.status(400).send({ error: "reason required for dispute" });
    }

    await TicketsService.resolveTicket(actor, id, action, request.id, paymentDate, paymentNote, newDeadlineDate, reason);
    const msgMap: Record<string, string> = {
      mark_paid: "resolved",
      extend: "extended",
      dispute: "disputed",
      withdraw: "withdrawn",
    };
    return { message: `Ticket ${msgMap[action]}` };
  }

  static async downloadDocument(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const result = await DocumentsService.downloadDocument(actor, id);
    return result;
  }

  static async verifyGst(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { id } = request.params;
    const { gstin } = request.body;

    const result = await ExpensesService.verifyGst(actor, id, gstin);
    return result;
  }
}
