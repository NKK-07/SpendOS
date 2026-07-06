import { z } from "zod";
import xss from "xss";

export const UserRoleSchema = z.enum(["PRINCIPAL", 'ADMIN', 'MANAGER', 'EMPLOYEE']);

// Users
export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: UserRoleSchema,
  defaultPassword: z.string().min(8).optional(),
  fullName: z.string().optional().transform(v => v ? xss(v) : v)
});

export const EditUserSchema = z.object({
  fullName: z.string().transform(v => xss(v))
});

export const FreezeUserSchema = z.object({
  reason: z.string().optional().transform(v => v ? xss(v) : v)
});

export const ResetPasswordAdminSchema = z.object({
  newPassword: z.string().min(10).regex(/\d/, "Password must contain at least one number")
});

export const UserParams = z.object({
  id: z.string()
});

export const NotificationParams = z.object({
  id: z.string()
});

// Company
export const PatchCompanySchema = z.object({
  name: z.string().optional().transform(v => v ? xss(v) : v),
  gstin: z.string().optional(),
  sla_days: z.coerce.number().optional(),
  session_timeout_minutes: z.coerce.number().optional()
});

// Audit & Activity
export const AuditLogQuery = z.object({
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(50)
});

export const ActivityQuery = z.object({
  take: z.coerce.number().optional().default(50),
  cursor: z.string().optional()
});
