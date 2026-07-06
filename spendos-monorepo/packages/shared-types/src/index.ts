import { z } from "zod";

export const RegisterSchema = z.object({
  companyName: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const CreateWalletSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
});

export const AllocateSchema = z.object({
  walletId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
});

export const SpendSchema = z.object({
  walletId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  merchant: z.string().min(1),
});

export * from "./fastify-schemas";
export * from "./schemas/admin.schema";
export * from "./schemas/auth.schema";
export * from "./schemas/expenses.schema";
export * from "./schemas/ledger.schema";

