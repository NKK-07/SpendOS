import { prisma, UserRole, tenantContext } from "@spendos/database";
import { signAccessToken, signRefreshToken, verifyRefreshToken, signResetToken, verifyResetToken } from "@spendos/auth";
import { AccountType, NormalBalance, EntryType, TransactionType, Prisma } from "@prisma/client";
import { createJournalGroup } from "@spendos/ledger";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { sendEmail } from "./email";
import { AuditService } from "./audit";
import { registerSchema, loginSchema } from "@spendos/shared-types";
import { z } from "zod";

const USER_SAFE_SELECT = {
  id: true,
  company_id: true,
  full_name: true,
  email: true,
  role: true,
  approval_scope: true,
  auto_approval_limit_paise: true,
  is_active: true,
  is_frozen: true,
  frozen_reason: true,
  mfa_enabled: true,
  last_login_at: true,
  created_at: true,
} as const;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof USER_SAFE_SELECT }>;

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export class AuthService {
  static async register(data: z.infer<typeof registerSchema>) {
    const { companyName, emailDomain, fullName, email, password, gstin } = data;

    const existing = await prisma.company.findUnique({ where: { email_domain: emailDomain } });
    if (existing) throw new Error("Company with this email domain already exists");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new Error("Email already in use");

    const password_hash = await hashPassword(password);

    return await tenantContext.run({ companyId: '', isSystem: true }, async () => {
      const company = await prisma.company.create({
        data: {
          name: companyName,
          email_domain: emailDomain,
          gstin: gstin || null,
          accounts: {
            create: [
              { name: "Corporate Treasury", account_type: AccountType.ASSET, normal_balance: NormalBalance.DEBIT },
              { name: "Corporate Expense", account_type: AccountType.EXPENSE, normal_balance: NormalBalance.DEBIT },
              { name: "Nodal Payout Account", account_type: AccountType.ASSET, normal_balance: NormalBalance.DEBIT },
              { name: "Treasury Allocation", account_type: AccountType.ASSET, normal_balance: NormalBalance.DEBIT },
              { name: "Owner Equity", account_type: AccountType.EQUITY, normal_balance: NormalBalance.CREDIT },
            ],
          },
        },
        include: { accounts: true },
      });

      const user = await prisma.user.create({
        data: {
          company_id: company.id,
          full_name: fullName,
          email,
          password_hash,
          role: UserRole.PRINCIPAL,
        },
      });

      const nodal = company.accounts.find((a: any) => a.name === "Nodal Payout Account")!;
      const equity = company.accounts.find((a: any) => a.name === "Owner Equity")!;
      
      await createJournalGroup({
        companyId: company.id,
        actorId: user.id,
        transactionType: TransactionType.SYSTEM_BOOTSTRAP,
        description: "Initial Capital Injection",
        idempotencyKey: `seed-${company.id}`,
        entries: [
          { accountId: nodal.id, amountPaise: 1000000000n, entryType: EntryType.DEBIT },
          { accountId: equity.id, amountPaise: 1000000000n, entryType: EntryType.CREDIT },
        ],
      });

      await AuditService.log({ companyId: company.id, actorId: user.id, action: "company_registered", targetType: "Company", targetId: company.id });

      const accessToken = signAccessToken({ userId: user.id, companyId: company.id, role: user.role, tokenVersion: user.token_version });
      const refreshToken = signRefreshToken({ userId: user.id, companyId: company.id, role: user.role, tokenVersion: user.token_version });

      return { user, company, accessToken, refreshToken };
    });
  }

  static async login(data: z.infer<typeof loginSchema>) {
    const { email, password } = data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Invalid credentials");
    if (!user.is_active) throw new Error("Account deactivated");
    if (user.is_frozen) throw new Error("Your account has been suspended. Contact your company admin.");

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) throw new Error("Invalid credentials");

    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });

    const mfaRequired = user.mfa_enabled; // Forced role MFA disabled for Beta 1

    if (mfaRequired) {
      const { signMfaToken } = require("@spendos/auth");
      const mfaToken = signMfaToken({ userId: user.id, companyId: user.company_id, role: user.role });
      return { mfaRequired: true, mfaToken };
    }

    const accessToken = signAccessToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });
    const refreshToken = signRefreshToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });

    return { mfaRequired: false, user, accessToken, refreshToken };
  }

  static async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) throw new Error("Invalid or expired refresh token");

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.is_active || user.is_frozen) throw new Error("User not valid");
    // Reject refresh tokens issued before the user's latest credential change.
    // (?? 0 keeps pre-migration tokens valid until the first password change.)
    if ((payload.tokenVersion ?? 0) !== user.token_version) throw new Error("Invalid or expired refresh token");

    const accessToken = signAccessToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });
    const newRefreshToken = signRefreshToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });

    return { accessToken, refreshToken: newRefreshToken };
  }
  
  static async getMe(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SAFE_SELECT });
    if (!user) throw new Error("User not found");
    return user;
  }

  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Silent fail

    const jti = crypto.randomUUID();
    const token = signResetToken({ sub: user.id, type: "password_reset", jti });
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: jti,
        password_reset_expires_at: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: "SpendOS Password Reset",
      html: `Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 15 minutes.`
    });
  }

  static async resetPassword(token: string, newPassword: string) {
    const payload = verifyResetToken(token);
    if (!payload || payload.type !== "password_reset") throw new Error("Invalid or expired token");

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.password_reset_token !== payload.jti || !user.password_reset_expires_at || user.password_reset_expires_at < new Date()) {
      throw new Error("Invalid or expired token");
    }

    const password_hash = await hashPassword(newPassword);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        password_reset_token: null,
        password_reset_expires_at: null,
        // Revoke every session issued before this reset.
        token_version: { increment: 1 },
      }
    });

    await AuditService.log({ companyId: user.company_id, actorId: user.id, action: "password_reset", targetType: "User", targetId: user.id });
  }
  static async getInvite(rawToken: string) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const invite = await prisma.inviteToken.findUnique({
      where: { token_hash: tokenHash },
      include: { company: { select: { name: true } } },
    });

    if (!invite || invite.is_used || invite.expires_at < new Date()) {
      throw new Error("Invalid or expired invite link");
    }

    return {
      email: invite.email,
      role: invite.role,
      companyName: invite.company.name,
    };
  }

  static async acceptInvite(rawToken: string, fullName: string, password: string) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const invite = await prisma.inviteToken.findUnique({
      where: { token_hash: tokenHash },
      include: { company: { select: { name: true } } },
    });

    if (!invite || invite.is_used || invite.expires_at < new Date()) {
      throw new Error("Invalid or expired invite link");
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existingUser) throw new Error("An account with this email already exists");

    const password_hash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        company_id: invite.company_id,
        full_name: fullName,
        email: invite.email,
        password_hash,
        role: invite.role,
        invited_by: invite.invited_by,
      },
    });

    await prisma.inviteToken.update({
      where: { token_hash: tokenHash },
      data: { is_used: true },
    });

    await AuditService.log({
      companyId: invite.company_id,
      actorId: user.id,
      action: "invite_accepted",
      targetType: "User",
      targetId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    const accessToken = signAccessToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });
    const refreshToken = signRefreshToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });

    return {
      user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    };
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string, mfaCode?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    // ── Authentication (step 1): prove knowledge of the current password ──────
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) throw new Error("Current password is incorrect");

    // ── Authentication (step 2 / step-up): if MFA is enrolled, require a fresh
    // TOTP so a hijacked session (valid cookie, known password) still cannot
    // rotate the password without the second factor. Changing the password is a
    // high-value action (it also revokes every other session), so it warrants
    // the same second factor the account is otherwise protected by. ──────────
    if (user.mfa_enabled) {
      if (!mfaCode) {
        // Sentinel the frontend keys on to reveal the MFA field and retry.
        throw new Error("MFA code required");
      }
      if (!user.mfa_secret) throw new Error("MFA is enabled but not configured");

      const { verify: verifyTotp } = require("otplib");
      let mfaValid = false;
      try {
        const result = await verifyTotp({ token: mfaCode, secret: user.mfa_secret, epochTolerance: 30 });
        mfaValid = result.valid;
      } catch {
        mfaValid = false;
      }
      if (!mfaValid) throw new Error("Invalid MFA code");
    }

    const password_hash = await hashPassword(newPassword);
    // Revoke every session issued before this password change.
    await prisma.user.update({ where: { id: userId }, data: { password_hash, token_version: { increment: 1 } } });

    await AuditService.log({ companyId: user.company_id, actorId: user.id, action: "password_changed", targetType: "User", targetId: user.id, metadata: { mfa_verified: user.mfa_enabled } });
  }

  static async setupMfa(userId: string) {
    const { generateSecret, generateURI } = require("otplib");
    const QRCode = require("qrcode");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (user.mfa_enabled) throw new Error("MFA is already enabled");

    const secret = generateSecret();
    const otpauth = generateURI({ issuer: "SpendOS", label: user.email, secret });
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString("hex"));
    const hashedCodes = await Promise.all(recoveryCodes.map(code => hashPassword(code)));

    await prisma.user.update({
      where: { id: userId },
      data: { 
        mfa_secret: secret,
        recovery_codes: hashedCodes
      }
    });

    return { secret, qrCodeUrl, recoveryCodes };
  }

  static async verifyMfa(userId: string, token: string) {
    const { verify: verifyTotp } = require("otplib");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfa_secret) throw new Error("MFA setup not initiated");

    let isValid = false;
    let usedRecoveryCodeHash: string | null = null;

    if (token.length === 8) {
      // Check recovery codes
      for (const hash of user.recovery_codes) {
        if (await verifyPassword(token, hash)) {
          isValid = true;
          usedRecoveryCodeHash = hash;
          break;
        }
      }
    } else {
      try {
        const result = await verifyTotp({ token, secret: user.mfa_secret, epochTolerance: 30 });
        isValid = result.valid;
      } catch {
        // A malformed stored secret is treated as an auth failure rather than a
        // 500, so we never leak the secret's state to the caller.
        isValid = false;
      }
    }

    if (!isValid) throw new Error("Invalid MFA token or recovery code");

    const updateData: any = { mfa_enabled: true };
    if (usedRecoveryCodeHash) {
      updateData.recovery_codes = user.recovery_codes.filter(c => c !== usedRecoveryCodeHash);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    const { signAccessToken, signRefreshToken } = require("@spendos/auth");
    const accessToken = signAccessToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });
    const refreshToken = signRefreshToken({ userId: user.id, companyId: user.company_id, role: user.role, tokenVersion: user.token_version });

    return { user, accessToken, refreshToken };
  }
}
