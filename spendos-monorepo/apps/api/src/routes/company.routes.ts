import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { CompanyController } from "../controllers/company.controller";
import { PatchCompanySchema } from "@spendos/shared-types";
import { requireSettingsAccess } from "../rbac";

export const companyRoutes: FastifyPluginAsync = async (server) => {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.get("/company", {
    preHandler: [requireSettingsAccess]
  }, CompanyController.getCompany);

  fastify.patch("/company", {
    preHandler: [requireSettingsAccess],
    schema: { body: PatchCompanySchema }
  }, CompanyController.patchCompany);
};
