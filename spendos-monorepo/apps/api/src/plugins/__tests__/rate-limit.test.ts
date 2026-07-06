import { rateLimitKey } from "../rate-limit";

describe("rateLimitKey", () => {
  it("keys on the Fastify-computed req.ip", () => {
    expect(rateLimitKey({ ip: "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("ignores a spoofable X-Forwarded-For header", () => {
    // Even if an attacker sets X-Forwarded-For, the key is derived solely from
    // req.ip (which only reflects XFF when trustProxy is configured to the infra).
    const req: any = { ip: "203.0.113.7", headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } };
    expect(rateLimitKey(req)).toBe("203.0.113.7");
    expect(rateLimitKey(req)).not.toBe("1.1.1.1");
  });
});
