import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { LedgerController } from "../controllers/ledger.controller";
import { requireSettingsAccess } from "../rbac";
import {
  getWalletsResponseSchema,
  getLedgerResponseSchema,
  getJournalGroupsResponseSchema,
  PaginationQuerySchema
} from "@spendos/shared-types";

export async function ledgerRoutes(server: FastifyInstance, options: FastifyPluginOptions) {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.get("/wallets", {
    preHandler: [requireSettingsAccess],
    schema: {
      querystring: PaginationQuerySchema,
      response: {
        200: getWalletsResponseSchema,
      },
    },
  }, LedgerController.getWallets);

  fastify.get("/ledger", {
    preHandler: [requireSettingsAccess],
    schema: {
      querystring: PaginationQuerySchema,
      response: {
        200: getLedgerResponseSchema,
      },
    },
  }, LedgerController.getLedger);

  fastify.get("/journal-groups", {
    preHandler: [requireSettingsAccess],
    schema: {
      querystring: PaginationQuerySchema,
      response: {
        200: getJournalGroupsResponseSchema,
      },
    },
  }, LedgerController.getJournalGroups);
}
