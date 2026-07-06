import { prisma, UserRole } from "@spendos/database";
import { AuditService } from "./audit";
import { sendEmail } from "./email";
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from "../lib/errors";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export const ADMIN_UP: UserRole[] = [UserRole.PRINCIPAL, UserRole.ADMIN];

export function canCreateRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === UserRole.PRINCIPAL) return true;
  if (actorRole === UserRole.ADMIN) return ([UserRole.VIP, UserRole.MANAGER, UserRole.EMPLOYEE] as UserRole[]).includes(targetRole);
  if (actorRole === UserRole.VIP) return ([UserRole.MANAGER, UserRole.EMPLOYEE] as UserRole[]).includes(targetRole);
  if (actorRole === UserRole.MANAGER) return targetRole === UserRole.EMPLOYEE;
  return false;
}

export class UsersService {
  static async getUsers(companyId: string, actorRole: UserRole, take: number = 50, cursor?: string) {
    let roleFilter: UserRole[] | undefined;
    if (actorRole === UserRole.MANAGER) {
      roleFilter = [UserRole.EMPLOYEE];
    }
    
    const limit = Math.min(take, 100);
    const users = await prisma.user.findMany({
      where: { company_id: companyId, ...(roleFilter ? { role: { in: roleFilter } } : {}) },
      select: {
        id: true, full_name: true, email: true, role: true,
        is_active: true, is_frozen: true, frozen_reason: true,
        last_login_at: true, created_at: true,
      },
      orderBy: { created_at: "asc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    let nextCursor = null;
    if (users.length > limit) {
      const nextItem = users.pop();
      nextCursor = nextItem!.id;
    }

    return { data: users, meta: { nextCursor, hasMore: !!nextCursor } };
  }

  static async inviteUser(actor: any, data: any) {
    const targetRole = data.role as UserRole;
    if (!canCreateRole(actor.role, targetRole)) {
      throw new ForbiddenError(`Your role cannot invite a ${data.role}`);
    }

    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUser) throw new ConflictError("User with this email already exists");

    if (data.defaultPassword) {
      const password_hash = await hashPassword(data.defaultPassword);
      const fallbackName = data.email.split('@')[0];
      await prisma.user.create({
        data: {
          company_id: actor.companyId,
          full_name: data.fullName || fallbackName,
          email: data.email,
          password_hash,
          role: targetRole,
          invited_by: actor.userId,
        },
      });
      await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "user_created_directly", targetType: "User", metadata: { email: data.email, role: data.role } });
      return { message: "User created successfully", directCreation: true };
    }

    await prisma.inviteToken.updateMany({
      where: { company_id: actor.companyId, email: data.email, is_used: false },
      data: { is_used: true },
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.inviteToken.create({
      data: {
        company_id: actor.companyId,
        invited_by: actor.userId,
        email: data.email,
        role: targetRole,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "invite_sent", targetType: "User", metadata: { email: data.email, role: data.role } });

    await sendEmail({ to: data.email, subject: "You are invited to SpendOS", html: `Your invite token is: ${rawToken}` });
    return { message: "Invite sent", inviteToken: rawToken };
  }

  static async editUser(actor: any, userId: string, data: any) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");

    const isSelf = userId === actor.userId;
    const canEditOthers = ADMIN_UP.includes(actor.role);
    if (!isSelf && !canEditOthers) throw new ForbiddenError("Insufficient permissions");

    const updated = await prisma.user.update({ where: { id: userId }, data: { full_name: data.fullName } });
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "user_edited", targetType: "User", targetId: userId });

    return { id: updated.id, fullName: updated.full_name };
  }

  static async freezeUser(actor: any, userId: string, reason?: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");
    if (target.role === UserRole.PRINCIPAL) {
      throw new ForbiddenError("Cannot modify a Principal account");
    }

    await prisma.user.update({ where: { id: userId }, data: { is_frozen: true, frozen_reason: reason || null, frozen_by: actor.userId } });

    await prisma.notification.create({
      data: {
        company_id: actor.companyId, user_id: userId, type: "account_frozen",
        message: "Your account has been suspended. Contact your company admin."
      }
    });
    
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "account_frozen", targetType: "User", targetId: userId, metadata: { reason } });

    return { message: "Account frozen" };
  }

  static async unfreezeUser(actor: any, userId: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");

    await prisma.user.update({ where: { id: userId }, data: { is_frozen: false, frozen_reason: null, frozen_by: null } });

    await prisma.notification.create({
      data: {
        company_id: actor.companyId, user_id: userId, type: "account_unfrozen",
        message: "Your account has been reactivated. You can log in again."
      }
    });
    
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "account_unfrozen", targetType: "User", targetId: userId });

    return { message: "Account unfrozen" };
  }

  static async deactivateUser(actor: any, userId: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");
    if (target.role === UserRole.PRINCIPAL) {
      throw new ForbiddenError("Cannot modify a Principal account");
    }

    await prisma.user.update({ where: { id: userId }, data: { is_active: false } });
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "account_deactivated", targetType: "User", targetId: userId });

    return { message: "Account deactivated" };
  }

  static async reactivateUser(actor: any, userId: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");

    await prisma.user.update({ where: { id: userId }, data: { is_active: true } });
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "account_reactivated", targetType: "User", targetId: userId });

    return { message: "Account reactivated" };
  }

  static async resetUserPassword(actor: any, userId: string, newPassword: string) {
    if (userId === actor.userId) throw new BadRequestError("Use /auth/reset-password to reset your own password");

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.company_id !== actor.companyId) throw new NotFoundError("User not found");

    const password_hash = await hashPassword(newPassword);
    // Revoke every session the target user currently holds (admin-forced reset).
    await prisma.user.update({ where: { id: userId }, data: { password_hash, token_version: { increment: 1 } } });
    await AuditService.log({ companyId: actor.companyId, actorId: actor.userId, action: "password_reset_by_admin", targetType: "User", targetId: userId });

    return { message: "Password updated" };
  }
}
