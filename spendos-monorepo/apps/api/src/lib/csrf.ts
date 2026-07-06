import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * The shape of @fastify/csrf-protection's `csrfProtection` decorator: a
 * synchronous handler that calls `next()` on success, or `reply.send(403)`
 * (without calling `next`) on a missing/invalid token.
 */
export type CsrfProtection = (
  request: FastifyRequest,
  reply: FastifyReply,
  next: (err?: Error) => void
) => void;

/**
 * Runs CSRF protection for a state-changing request and reports whether it
 * passed. On failure the underlying handler has ALREADY sent a 403 response;
 * callers MUST stop processing (return) when this returns false, so no further
 * work runs and no second response is attempted.
 *
 * @returns true if the CSRF token is valid; false if it failed (403 already sent).
 *
 * @example
 * if (!enforceCsrf(fastify.csrfProtection, request, reply)) return;
 */
export function enforceCsrf(
  csrfProtection: CsrfProtection,
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  let passed = false;
  csrfProtection(request, reply, (err?: Error) => {
    if (!err) passed = true;
  });
  return passed;
}
