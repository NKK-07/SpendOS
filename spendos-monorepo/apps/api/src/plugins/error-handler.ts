import fp from "fastify-plugin";
import { AppError } from "../lib/errors";

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, request, reply) => {
    const user = (request as any).user;
    
    // Structured error payload for centralized logging
    const logPayload = {
      errorCode: error.code || "INTERNAL_ERROR",
      userId: user?.userId || "anonymous",
      companyId: user?.companyId || "anonymous",
      traceId: request.id,
      message: error.message,
      path: request.url,
      method: request.method,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    };

    request.log.error(logPayload);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: "Validation Error",
        details: error.validation,
      });
    }

    if (error.name === "PrismaClientKnownRequestError") {
      const prismaError = error as any;
      if (prismaError.code === "P2025") {
        return reply.status(404).send({ error: "Resource not found" });
      }
      if (prismaError.code === "P2002") {
        return reply.status(409).send({ error: "Resource already exists (conflict)" });
      }
      return reply.status(400).send({ error: "Database operation failed", details: prismaError.meta });
    }

    // Rate limit fallback parsing
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: "Rate limit exceeded" });
    }

    return reply.status(500).send({ error: "Internal Server Error" });
  });
});
