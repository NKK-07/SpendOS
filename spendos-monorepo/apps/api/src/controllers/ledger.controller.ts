import { FastifyRequest, FastifyReply } from "fastify";
import { LedgerService } from "../services/ledger.service";

function serializeBigInt(obj: any): any {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export class LedgerController {
  static async getWallets(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const enriched = await LedgerService.getWallets(actor.companyId, take, cursor);
    return serializeBigInt(enriched);
  }

  static async getLedger(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const entries = await LedgerService.getLedger(actor.companyId, take, cursor);
    return serializeBigInt(entries);
  }

  static async getJournalGroups(request: any, reply: FastifyReply) {
    const actor = (request as any).user;
    const { take, cursor } = request.query as any || {};
    const groups = await LedgerService.getJournalGroups(actor.companyId, take, cursor);
    return serializeBigInt(groups);
  }
}
