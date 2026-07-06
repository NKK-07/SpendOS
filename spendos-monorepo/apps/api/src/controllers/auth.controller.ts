import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "../services/auth.service";
import { registerSchema, loginSchema } from "@spendos/shared-types";
import { z } from "zod";

type RegisterReq = FastifyRequest<{ Body: z.infer<typeof registerSchema> }>;
type LoginReq = FastifyRequest<{ Body: z.infer<typeof loginSchema> }>;

// Helper for cookies
function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
  reply.setCookie('accessToken', accessToken, cookieOpts);
  reply.setCookie('refreshToken', refreshToken, cookieOpts);
}

export class AuthController {
  static async register(request: any, reply: FastifyReply) {
    try {
      const data = request.body;
      const { user, company, accessToken, refreshToken } = await AuthService.register(data);
      
      setAuthCookies(reply, accessToken, refreshToken);
      return { user: { id: user.id, fullName: user.full_name, role: user.role }, companyId: company.id };
    } catch (error: any) {
      if (error.message.includes("already exists") || error.message.includes("already in use")) {
        return reply.status(409).send({ error: error.message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  static async login(request: any, reply: FastifyReply) {
    try {
      const data = request.body;
      const result = await AuthService.login(data);
      
      if (result.mfaRequired) {
        return { mfaRequired: true, mfaToken: result.mfaToken };
      }

      setAuthCookies(reply, result.accessToken!, result.refreshToken!);
      return { user: { id: result.user!.id, fullName: result.user!.full_name, role: result.user!.role, email: result.user!.email }, companyId: result.user!.company_id, accessToken: result.accessToken, refreshToken: result.refreshToken };
    } catch (error: any) {
      if (error.message === "Invalid credentials") {
        return reply.status(401).send({ error: error.message });
      }
      if (error.message.includes("deactivated") || error.message.includes("suspended")) {
        return reply.status(403).send({ error: error.message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  static async logout(request: any, reply: FastifyReply) {
    reply.clearCookie("accessToken", { path: "/" });
    reply.clearCookie("refreshToken", { path: "/" });
    return { message: "Logged out" };
  }

  static async refresh(request: any, reply: FastifyReply) {
    try {
      const oldRefreshToken = request.cookies.refreshToken;
      if (!oldRefreshToken) return reply.status(400).send({ error: "refreshToken required" });

      const { accessToken, refreshToken } = await AuthService.refresh(oldRefreshToken);
      
      setAuthCookies(reply, accessToken, refreshToken);
      return { message: "Tokens refreshed" };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  }

  static async me(request: any, reply: FastifyReply) {
    try {
      const authUser = (request as any).user;
      if (!authUser) {
        return reply.status(401).send({ error: "Not authenticated" });
      }
      const user = await AuthService.getMe(authUser.userId);
      return {
        id: user.id,
        company_id: user.company_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        is_frozen: user.is_frozen,
        frozen_reason: user.frozen_reason,
        mfa_enabled: user.mfa_enabled,
        approval_scope: user.approval_scope,
        auto_approval_limit_paise: user.auto_approval_limit_paise,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
      };
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  }

  static async forgotPassword(request: any, reply: FastifyReply) {
    try {
      const { email } = request.body;
      await AuthService.forgotPassword(email);
      return { message: "If an account exists, a reset link has been sent." };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  static async resetPassword(request: any, reply: FastifyReply) {
    try {
      const { token, newPassword } = request.body;
      await AuthService.resetPassword(token, newPassword);
      reply.clearCookie("accessToken", { path: "/" });
      reply.clearCookie("refreshToken", { path: "/" });
      return { message: "Password reset successful. Please log in again." };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  static async changePassword(request: any, reply: FastifyReply) {
    try {
      const authUser = (request as any).user;
      if (!authUser) return reply.status(401).send({ error: "Not authenticated" });
      const { currentPassword, newPassword, mfaCode } = request.body as { currentPassword: string; newPassword: string; mfaCode?: string };
      await AuthService.changePassword(authUser.userId, currentPassword, newPassword, mfaCode);
      return { message: "Password changed successfully" };
    } catch (error: any) {
      // MFA step-up required: distinct signal so the client can reveal the code field.
      if (error.message === "MFA code required") {
        return reply.status(403).send({ error: error.message, mfaRequired: true });
      }
      if (error.message === "Current password is incorrect" || error.message === "Invalid MFA code") {
        return reply.status(401).send({ error: error.message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }

  static async setupMfa(request: any, reply: FastifyReply) {
    try {
      // Must be authenticated (either via valid access token or mfaToken)
      const authUser = (request as any).user;
      const { secret, qrCodeUrl } = await AuthService.setupMfa(authUser.userId);
      return { secret, qrCodeUrl };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  }

  static async verifyMfa(request: any, reply: FastifyReply) {
    try {
      const authUser = (request as any).user;
      const { token } = request.body;
      const { user, accessToken, refreshToken } = await AuthService.verifyMfa(authUser.userId, token);

      setAuthCookies(reply, accessToken, refreshToken);
      return { user: { id: user.id, fullName: user.full_name, role: user.role, email: user.email }, companyId: user.company_id, accessToken, refreshToken };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  }

  static async getInvite(request: any, reply: FastifyReply) {
    try {
      const { token } = request.params as { token: string };
      const data = await AuthService.getInvite(token);
      return reply.send(data);
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  }

  static async acceptInvite(request: any, reply: FastifyReply) {
    try {
      const { token } = request.params as { token: string };
      const { fullName, password } = request.body as { fullName: string; password: string };
      const result = await AuthService.acceptInvite(token, fullName, password);
      return reply.send(result);
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        return reply.status(409).send({ error: error.message });
      }
      return reply.status(400).send({ error: error.message });
    }
  }
}

