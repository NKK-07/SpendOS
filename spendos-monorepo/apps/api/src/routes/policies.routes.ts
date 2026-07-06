import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { PoliciesController } from "../controllers/policies.controller";
import { requireSettingsAccess, requireReviewer } from "../rbac";

const UpdatePolicySchema = z.object({
  autoApproveThreshold: z.union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative()
  ]).transform(v => v.toString()),
  receiptRequiredAbove: z.union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative()
  ]).transform(v => v.toString())
});

export async function policiesRoutes(server: FastifyInstance) {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  // Any authenticated user can read policies (so the frontend can display limits, etc)
  fastify.get("/policies", PoliciesController.getPolicy);

  // Only Admins can modify spend policies
  fastify.put("/policies", {
    preHandler: [requireSettingsAccess],
    schema: {
      body: UpdatePolicySchema
    }
  }, PoliciesController.updatePolicy);
}
