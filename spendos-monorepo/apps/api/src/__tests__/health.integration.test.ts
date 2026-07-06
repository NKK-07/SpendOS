import { mockDeep } from "jest-mock-extended";
import { PrismaClient } from "@spendos/database";

// Mock the prisma client exported from @spendos/database
jest.mock("@spendos/database", () => {
  const original = jest.requireActual("@spendos/database");
  return {
    __esModule: true,
    ...original,
    prisma: mockDeep<PrismaClient>(),
  };
});

jest.mock("../services/cron", () => ({
  startCronJobs: jest.fn(),
}));

jest.mock("../services/outbox.processor", () => ({
  startOutboxWorker: jest.fn(),
}));

import { prisma } from "@spendos/database";
import { redis } from "../services/redis.service";
import { fastify } from "../server";

const prismaMock = prisma as any;

describe("Health Check API Integration Tests", () => {
  let pingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    pingSpy = jest.spyOn(redis, "ping");
  });

  afterEach(() => {
    pingSpy.mockRestore();
  });

  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    await prisma.$disconnect();
    await redis.quit();
  });

  it("should return 200 Healthy when database and redis are both online", async () => {
    // Mock successful DB raw query
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    // Mock successful Redis ping
    pingSpy.mockResolvedValue("PONG");

    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
  });

  it("should return 200 Degraded when database is online but redis is offline", async () => {
    // Mock successful DB raw query
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    // Mock failed Redis ping
    pingSpy.mockRejectedValue(new Error("Redis connection timed out"));

    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("degraded");
  });

  it("should return 503 Unhealthy when database is offline", async () => {
    // Mock failed DB raw query
    prismaMock.$queryRaw.mockRejectedValue(new Error("Postgres connection refused"));
    // Mock successful Redis ping (though status will still be unhealthy)
    pingSpy.mockResolvedValue("PONG");

    const response = await fastify.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("database_unavailable");
  });

  it("should also support the /api/v1/health path prefix", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    pingSpy.mockResolvedValue("PONG");

    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
  });
});
