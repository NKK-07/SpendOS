import { enforceCsrf, CsrfProtection } from "../csrf";

describe("enforceCsrf", () => {
  const request: any = {};
  const reply: any = { send: jest.fn() };

  it("returns true when the CSRF handler calls next() with no error", () => {
    const csrf: CsrfProtection = (_req, _reply, next) => next();
    expect(enforceCsrf(csrf, request, reply)).toBe(true);
  });

  it("returns false when the CSRF handler sends a 403 and never calls next", () => {
    // Mirrors @fastify/csrf-protection: on an invalid token it calls
    // reply.send(error) and does NOT invoke next.
    const csrf: CsrfProtection = (_req, replyArg) => {
      (replyArg as any).send(new Error("Invalid csrf token"));
    };
    expect(enforceCsrf(csrf, request, reply)).toBe(false);
  });

  it("returns false when next is called WITH an error", () => {
    const csrf: CsrfProtection = (_req, _reply, next) => next(new Error("bad"));
    expect(enforceCsrf(csrf, request, reply)).toBe(false);
  });
});
