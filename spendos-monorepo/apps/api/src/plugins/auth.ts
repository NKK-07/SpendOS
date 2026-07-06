import fp from "fastify-plugin";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifyHelmet from "@fastify/helmet";
import { prisma, tenantContext } from "@spendos/database";
import { verifyToken } from "@spendos/auth";
import { env } from "../config";
import { enforceCsrf } from "../lib/csrf";

const PUBLIC_ROUTES = [
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/invite/",
  "/api/v1/health",
  "/health",
  "/api/v1/csrf",
  "/local-s3"
];

export default fp(async (fastify) => {
  fastify.addHook('onRequest', (request, reply, done) => {
    tenantContext.run({ companyId: '' }, done);
  });
  fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  });
  
  // COOKIE_SECRET is validated (presence + length + non-default in prod) at boot
  // by ./config, so it is always safe to use directly — no insecure fallback.
  fastify.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  fastify.register(fastifyCsrfProtection, { cookieOpts: { signed: true } });

  // Global Auth Middleware
  fastify.addHook("preHandler", async (request, reply) => {
    const isPublic = PUBLIC_ROUTES.some((r) => request.url.startsWith(r));
    if (isPublic) return;

    let accessToken = request.cookies.accessToken;
    
    if (!accessToken && request.headers.authorization) {
      const parts = request.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        accessToken = parts[1];
      }
    }

    if (!accessToken) {
      return reply.status(401).send({ error: "Missing or invalid token" });
    }

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && process.env.NODE_ENV !== "test") {
      // On failure, enforceCsrf's handler has already sent a 403; halt here so
      // no further processing runs and no second response is attempted.
      if (!enforceCsrf(fastify.csrfProtection, request, reply)) return;
    }

    let payload = verifyToken(accessToken);
    
    // If regular token fails, and we are accessing an MFA route, try MFA token
    if (!payload && request.url.startsWith("/api/v1/auth/mfa")) {
      const { verifyMfaToken } = require("@spendos/auth");
      payload = verifyMfaToken(accessToken);
    }

    if (!payload) return reply.status(401).send({ error: "Token expired or invalid" });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, company_id: true, role: true, is_active: true, is_frozen: true, approval_scope: true, token_version: true },
    });

    if (!user || user.company_id !== payload.companyId) {
      return reply.status(401).send({ error: "Invalid user" });
    }
    // Session revocation: a token minted before the user's latest password
    // change/reset carries a stale version and is rejected. (?? 0 keeps
    // pre-migration tokens valid until the first credential change.)
    if (((payload as any).tokenVersion ?? 0) !== (user.token_version ?? 0)) {
      return reply.status(401).send({ error: "Token expired or invalid" });
    }
    if (!user.is_active) return reply.status(403).send({ error: "Account deactivated" });
    if (user.is_frozen) return reply.status(403).send({ error: "Your account has been suspended. Contact your company admin." });

    const store = tenantContext.getStore();
    if (store) store.companyId = user.company_id;

    // approval_scope (nullable JSON) carries ABAC limits (max_approval_limit,
    // cost_centers) enforced by PolicyEngine on approve/reject. Null ⇒ no ABAC
    // restriction beyond role rules.
    (request as any).user = { userId: user.id, companyId: user.company_id, role: user.role, approval_scope: user.approval_scope };

    // Mobile App Attestation (Play Integrity / iOS App Attest).
    //
    // Enforcement is gated by MOBILE_ATTESTATION_ENABLED (default false) so the
    // security posture is explicit and auditable instead of relying on a magic
    // bypass string. When enforcement is ON, mobile requests must carry an
    // attestation token AND a configured cryptographic verifier must accept it.
    // The provider verifier (Google Play Integrity / Apple App Attest) is a
    // credential-dependent integration; until it is wired, enforcement fails
    // CLOSED — we never accept a token we cannot actually verify.
    if (request.headers['x-client-type'] === 'mobile' && env.MOBILE_ATTESTATION_ENABLED) {
      const attestationToken = request.headers['x-app-attestation'];
      if (!attestationToken) {
        return reply.status(401).send({ error: "Missing App Attestation Token. Device integrity could not be verified." });
      }

      // No real provider verifier is configured yet. Rather than trust the token,
      // reject it: an enabled-but-unconfigured attestation gate must not silently
      // pass unverified devices.
      return reply.status(503).send({ error: "Mobile attestation enforcement is enabled but no verification provider is configured." });
    }
  });
});
