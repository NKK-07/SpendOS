import { z } from "zod";

export const registerSchema = z.object({
  companyName: z.string().trim().max(255),
  emailDomain: z.string().trim().toLowerCase().max(255),
  fullName: z.string().trim().max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(10).regex(/\d/, "Password must contain at least one number"),
  gstin: z.string().trim().max(15).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
