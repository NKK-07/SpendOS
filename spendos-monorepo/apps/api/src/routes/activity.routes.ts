import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { ActivityController } from "../controllers/activity.controller";
import { AuditLogQuery, ActivityQuery } from "@spendos/shared-types";
import { requireSettingsAccess, requireEmployeeUp } from "../rbac";

export const activityRoutes: FastifyPluginAsync = async (server) => {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.get("/dashboard/pulse", {
    preHandler: [requireEmployeeUp]
  }, ActivityController.getDashboardPulse);

  fastify.get("/activity", {
    schema: { querystring: ActivityQuery }
  }, ActivityController.getActivity);

  fastify.get("/audit-log", {
    preHandler: [requireSettingsAccess],
    schema: { querystring: AuditLogQuery }
  }, ActivityController.getAuditLog);
};
