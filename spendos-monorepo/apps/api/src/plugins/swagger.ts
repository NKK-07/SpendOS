import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export default fp(async (fastify) => {
  fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "SpendOS API",
        description: "SpendOS Unified Finance API",
        version: "0.1.0",
      },
      servers: [{ url: process.env.API_URL || "http://localhost:3000" }],
    },
    transform: jsonSchemaTransform,
  });

  fastify.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });
});
