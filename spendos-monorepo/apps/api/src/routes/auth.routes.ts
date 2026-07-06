import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { AuthController } from "../controllers/auth.controller";
import { registerSchema, loginSchema } from "@spendos/shared-types";

import { z } from "zod";

const inviteTokenParams = z.object({ token: z.string().min(1) });

const acceptInviteBody = z.object({
  fullName: z.string().min(1),
  password: z.string().min(10),
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(10)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(10, "New password must be at least 10 characters"),
  // Step-up second factor, required only when the user has MFA enabled.
  mfaCode: z.string().min(6).max(8).optional(),
});


export async function authRoutes(server: FastifyInstance) {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.post("/auth/register", {
    config: {
      rateLimit: {
        max: process.env.NODE_ENV === "production" ? 3 : 100,
        timeWindow: 60 * 60 * 1000 // 3 per hour (production)
      }
    },
    schema: {
      body: registerSchema
    }
  }, AuthController.register);

  fastify.post("/auth/login", {
    config: {
      rateLimit: {
        max: process.env.NODE_ENV === "production" ? 5 : 100,
        timeWindow: 15 * 60 * 1000 // 5 per 15 min (production)
      }
    },
    schema: {
      body: loginSchema
    }
  }, AuthController.login);

  fastify.post("/auth/logout", AuthController.logout);

  fastify.post("/auth/refresh", AuthController.refresh);

  fastify.post("/auth/forgot-password", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: 15 * 60 * 1000 // 3 per 15 min
      }
    },
    schema: {
      body: forgotPasswordSchema
    }
  }, AuthController.forgotPassword);

  fastify.post("/auth/reset-password", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000 // 5 per 15 min
      }
    },
    schema: {
      body: resetPasswordSchema
    }
  }, AuthController.resetPassword);

  fastify.get("/auth/me", AuthController.me);

  fastify.post("/auth/change-password", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000 // 5 per 15 min
      }
    },
    schema: {
      body: changePasswordSchema
    }
  }, AuthController.changePassword);

  const verifyMfaSchema = z.object({
    token: z.string().min(6).max(8)
  });

  fastify.post("/auth/mfa/setup", AuthController.setupMfa);
  fastify.post("/auth/mfa/verify", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000 // 5 attempts per 15 min
      }
    },
    schema: {
      body: verifyMfaSchema
    }
  }, AuthController.verifyMfa);

  // Public invite endpoints — no auth required (new user has no account yet).
  // These are covered by the PUBLIC_ROUTES whitelist in auth.ts via "/api/v1/auth/invite/".
  fastify.get("/auth/invite/:token", {
    schema: { params: inviteTokenParams }
  }, AuthController.getInvite);

  fastify.post("/auth/invite/:token/accept", {
    config: {
      rateLimit: {
        max: process.env.NODE_ENV === "production" ? 10 : 100,
        timeWindow: 60 * 60 * 1000
      }
    },
    schema: {
      params: inviteTokenParams,
      body: acceptInviteBody
    }
  }, AuthController.acceptInvite);
}
