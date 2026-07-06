import { z } from "zod";
import { ExpenseCategory, ExpenseStatus } from "@spendos/database";
import xss from "xss";

/** Sanitized string helper — strips XSS at the Zod boundary */
const sanitizedString = () => z.string().transform(v => xss(v));
const sanitizedStringOptional = () => z.string().optional().transform(v => v ? xss(v) : v);

export const CreateExpenseSchema = z.object({
  amountPaise: z.union([
    z.string().regex(/^\d+$/).transform(v => BigInt(v)),
    z.number().int().positive().transform(v => BigInt(v))
  ]),
  expenseDate: z.string(),
  category: z.nativeEnum(ExpenseCategory),
  description: sanitizedStringOptional(),
});

export const ListExpensesQuerySchema = z.object({
  take: z.coerce.number().int().positive().max(100).optional().default(50),
  status: z.nativeEnum(ExpenseStatus).optional(),
  cursor: z.string().optional(),
});

export const ExpenseIdParamSchema = z.object({
  id: z.string(),
});

export const RejectExpenseSchema = z.object({
  reason: sanitizedString(),
});

export const RequestProofSchema = z.object({
  note: sanitizedStringOptional(),
});

export const MarkPaidSchema = z.object({
  paymentDate: z.string().optional(),
  paymentNote: sanitizedStringOptional(),
});

export const UploadUrlQuerySchema = z.object({
  filename: z.string(),
  contentType: z.string(),
});

export const ConfirmUploadSchema = z.object({
  s3Key: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().int(),
  docType: z.enum(["original", "proof"]),
});

export const CreateTicketSchema = z.object({
  expenseId: z.string(),
  note: sanitizedStringOptional(),
});

export const ResolveTicketSchema = z.object({
  action: z.enum(["extend", "dispute"]),
  paymentDate: z.string().optional(),
  paymentNote: sanitizedStringOptional(),
  newDeadlineDate: z.string().optional(),
  reason: sanitizedStringOptional(),
});

