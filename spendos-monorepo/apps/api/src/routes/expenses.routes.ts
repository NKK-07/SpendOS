import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ExpensesController } from "../controllers/expenses.controller";
import { requireReviewer, requireSettingsAccess } from "../rbac";
import * as schemas from "@spendos/shared-types";

export async function expensesRoutes(server: FastifyInstance) {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.post("/expenses", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: schemas.CreateExpenseSchema
    }
  }, ExpensesController.createExpense);

  fastify.get("/expenses", {
    schema: {
      querystring: schemas.ListExpensesQuerySchema
    }
  }, ExpensesController.getExpenses);

  fastify.get("/expenses/:id", {
    schema: {
      params: schemas.ExpenseIdParamSchema
    }
  }, ExpensesController.getExpenseById);

  fastify.post("/expenses/:id/approve", {
    preHandler: [requireReviewer],
    schema: {
      params: schemas.ExpenseIdParamSchema
    }
  }, ExpensesController.approveExpense);

  fastify.post("/expenses/:id/reject", {
    preHandler: [requireReviewer],
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: schemas.RejectExpenseSchema
    }
  }, ExpensesController.rejectExpense);

  fastify.post("/expenses/:id/request-proof", {
    preHandler: [requireReviewer],
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: schemas.RequestProofSchema
    }
  }, ExpensesController.requestProof);

  fastify.post("/expenses/:id/mark-paid", {
    preHandler: [requireSettingsAccess],
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: schemas.MarkPaidSchema
    }
  }, ExpensesController.markPaid);

  fastify.get("/expenses/:id/upload-url", {
    schema: {
      params: schemas.ExpenseIdParamSchema,
      querystring: schemas.UploadUrlQuerySchema
    }
  }, ExpensesController.getUploadUrl);

  fastify.post("/expenses/:id/confirm-upload", {
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: schemas.ConfirmUploadSchema
    }
  }, ExpensesController.confirmUpload);


  fastify.post("/tickets", {
    schema: {
      body: schemas.CreateTicketSchema
    }
  }, ExpensesController.createTicket);

  fastify.get("/tickets", {
    schema: {
      querystring: schemas.PaginationQuerySchema
    }
  }, ExpensesController.getTickets);

  fastify.post("/tickets/:id/resolve", {
    preHandler: [requireReviewer],
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: schemas.ResolveTicketSchema
    }
  }, ExpensesController.resolveTicket);

  fastify.get("/documents/:id/download", {
    schema: {
      params: schemas.ExpenseIdParamSchema
    }
  }, ExpensesController.downloadDocument);

  fastify.post("/expenses/:id/verify-gst", {
    preHandler: [requireReviewer],
    schema: {
      params: schemas.ExpenseIdParamSchema,
      body: z.object({
        gstin: z.string().length(15)
      })
    }
  }, ExpensesController.verifyGst);
}
