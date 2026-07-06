import { z } from "zod";
import xss from "xss";

export const FastifySignupSchema = {
  body: z.object({
    companyName: z.string().min(1).transform(v => xss(v)),
    emailDomain: z.string().min(1),
    fullName: z.string().min(1).transform(v => xss(v)),
    email: z.string().email(),
    password: z.string().min(8),
    gstin: z.string().optional(),
  }),
};

export const FastifyLoginSchema = {
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
};

export const FastifyMarkPaidSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    paymentDate: z.string().datetime().optional().or(z.string().optional()),
    paymentNote: z.string().optional().transform(v => v ? xss(v) : v),
  }),
};

export const FastifyCreateExpenseSchema = {
  body: z.object({
    amountPaise: z.union([z.number(), z.string(), z.bigint()]).transform((val) => BigInt(val)),
    expenseDate: z.string(),
    category: z.string(),
    description: z.string().optional().transform(v => v ? xss(v) : v),
  }),
};

export const FastifyUpdateProfileSchema = {
  body: z.object({
    fullName: z.string().min(1).transform(v => xss(v)),
  }),
};

export const FastifySetPasswordSchema = {
  body: z.object({
    password: z.string().min(8),
  }),
};

export const FastifyInviteUserSchema = {
  body: z.object({
    email: z.string().email(),
    role: z.enum(["PRINCIPAL", 'ADMIN', 'MANAGER', 'EMPLOYEE']),
    fullName: z.string().min(1).transform(v => xss(v)),
    defaultPassword: z.string().min(8).optional(),
  }),
};
